import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";

const router = Router();
const storeRoles = roles("admin", "store_fo");

const productSchema = z.object({
  name: z.string().min(1), price: z.coerce.number().int().nonnegative(), category: z.string().min(1),
  categoryId: z.string().optional().nullable(), description: z.string().default(""), sku: z.string().min(1),
  barcode: z.string().min(1), stock: z.coerce.number().int().nonnegative().default(0), cost: z.coerce.number().int().nonnegative().default(0),
  tax: z.coerce.number().int().nonnegative().default(0), status: z.enum(["active", "inactive"]).default("active")
});

router.get("/categories", auth, storeRoles, asyncRoute(async (_req, res) => {
  res.json(await prisma.productCategory.findMany({ orderBy: { name: "asc" } }));
}));
router.post("/categories", auth, storeRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1), active: z.boolean().optional() }).parse(req.body);
  res.status(201).json(await prisma.productCategory.create({ data }));
}));
router.patch("/categories/:id", auth, storeRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).parse(req.body);
  res.json(await prisma.productCategory.update({ where: { id: String(req.params.id) }, data }));
}));
router.delete("/categories/:id", auth, storeRoles, asyncRoute(async (req, res) => {
  await prisma.productCategory.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

router.post("/products/import", auth, storeRoles, asyncRoute(async (req, res) => {
  const rows = z.array(productSchema).min(1).parse(req.body.rows);
  const result = await prisma.$transaction(async tx => {
    const created = [];
    for (const row of rows) {
      const category = await tx.productCategory.upsert({ where: { name: row.category }, update: {}, create: { name: row.category } });
      created.push(await tx.product.upsert({
        where: { sku: row.sku },
        update: { ...row, categoryId: category.id },
        create: { ...row, categoryId: category.id }
      }));
    }
    return created;
  });
  res.status(201).json({ imported: result.length, products: result });
}));

router.get("/orders", auth, storeRoles, asyncRoute(async (_req, res) => {
  res.json(await prisma.storeOrder.findMany({ orderBy: { id: "desc" } }));
}));

router.post("/orders", auth, storeRoles, asyncRoute(async (req, res) => {
  const body=z.object({customer:z.string().min(1).max(120),items:z.array(z.object({productId:z.string().min(1),quantity:z.number().int().min(1).max(50)})).min(1).max(50),discount:z.number().int().min(0).default(0),dueDate:z.string().optional(),paymentMethod:z.enum(["Cash","Pay Later","Pay Online"])}).parse(req.body);
  if(body.paymentMethod==="Pay Online")return res.status(503).json({message:"Online Store checkout is not configured yet. No order or payment was recorded."});
  const ids=[...new Set(body.items.map(x=>x.productId))];
  const result=await prisma.$transaction(async tx=>{
    const products=await tx.product.findMany({where:{id:{in:ids},status:"active"}});
    if(products.length!==ids.length)throw Object.assign(new Error("One or more products are unavailable. Refresh the product list."),{statusCode:409});
    const lines=body.items.map(line=>{const p=products.find(x=>x.id===line.productId)!;return {productId:p.id,name:p.name,quantity:line.quantity,price:p.price,taxRate:p.tax};});
    const subtotal=lines.reduce((sum,line)=>sum+line.quantity*line.price,0);
    if(body.discount>subtotal)throw Object.assign(new Error("Discount cannot exceed the subtotal."),{statusCode:400});
    const undiscountedTax=lines.reduce((sum,line)=>sum+line.quantity*line.price*line.taxRate/100,0);
    const tax=subtotal?Math.round(undiscountedTax*(subtotal-body.discount)/subtotal):0;
    const total=subtotal-body.discount+tax;
    for(const line of lines){const changed=await tx.product.updateMany({where:{id:line.productId,status:"active",stock:{gte:line.quantity}},data:{stock:{decrement:line.quantity}}});if(!changed.count)throw Object.assign(new Error(`${line.name} no longer has enough stock.`),{statusCode:409});}
    const paid=body.paymentMethod==="Cash"?total:0;
    const order=await tx.storeOrder.create({data:{customer:body.customer,total,discount:body.discount,tax,paid,dueDate:body.paymentMethod==="Pay Later"?body.dueDate||null:null,status:body.paymentMethod==="Cash"?"paid":"pending",items:lines.map(({taxRate,...line})=>line)}});
    if(body.paymentMethod==="Cash")await tx.transaction.create({data:{date:today(),customer:body.customer,business:"Store",item:lines.map(x=>`${x.name} ×${x.quantity}`).join(", "),amount:subtotal,discount:body.discount,tax,finalAmount:total,paymentMethod:"Cash",staff:(req as any).user?.name||"Store FO",status:"paid"}});
    await tx.notification.create({data:{userId:null,audience:"store_fo",title:"New Store sale",body:`${body.customer} · ${total.toLocaleString()} MMK · ${body.paymentMethod}`,link:"/store-fo/orders",type:"transaction",icon:"shopping-bag",entityType:"store_order",entityId:order.id}});
    return order;
  });
  res.status(201).json(result);
}));

export default router;
