
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.court.deleteMany();
  await prisma.coach.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.student.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.badmintonPackage.deleteMany();
  await prisma.gymPackage.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.class.deleteMany();
  await prisma.membershipPlan.deleteMany();

  const passwordHash = await bcrypt.hash("password123",12);
  const users = [
    ["Sai Zay","member@zawana.test","member"],
    ["Coach Sai","coach@zawana.test","coach"],
    ["Zawana Admin","admin@zawana.test","admin"],
    ["Gym FO","gymfo@zawana.test","gym_fo"],
    ["Revive FO","clinicfo@zawana.test","clinic_fo"],
    ["Badminton FO","badminton@zawana.test","badminton_fo"],
    ["Lining Store","store@zawana.test","store_fo"],
    ["Zawana Cafe","cafe@zawana.test","cafe_fo"],
    ["Dr. Lin","doctor@zawana.test","doctor"]
  ] as const;
  const created:any[]=[];
  for(const [name,email,role] of users) created.push(await prisma.user.create({data:{name,email,passwordHash,role:role as any,membership:role==="member"?"Athlete":undefined}}));

  const member=created[0];
  const coachUser=created[1];
  const doctorUser=created[8];

  const courts=[
    ["Court 01","Premium","Tournament",18000,"available"],
    ["Court 02","Premium","Tournament",18000,"maintenance"],
    ["Court 03","Standard","Premium",15000,"available"],
    ["Court 04","Standard","Premium",15000,"available"],
    ["Court 05","Premium","Tournament",18000,"available"],
    ["Court 06","Premium","Tournament",18000,"available"]
  ] as const;
  const courtRows:any[]=[];
  for(const [name,type,surface,price,status] of courts) courtRows.push(await prisma.court.create({data:{name,type,surface,price,status:status as any,features:["Indoor","LED lighting",surface==="Tournament"?"Tournament flooring":"Premium flooring"]}}));

  const coach=await prisma.coach.create({data:{name:coachUser.name,specialty:"Badminton",phone:coachUser.phone||"09 700 100 200",email:coachUser.email,userId:coachUser.id}});
  const doctor=await prisma.doctor.create({data:{userId:doctorUser.id,specialty:"Physiotherapy & rehabilitation",phone:doctorUser.phone||""}});

  await prisma.schedule.create({data:{person:doctorUser.name,role:"doctor",day:"Tuesday",start:"10:00",end:"18:00",service:"Physiotherapy",active:true,doctorId:doctor.id}});

  await prisma.badmintonPackage.createMany({data:[
    {title:"Court 10 Sessions",price:150000,sessions:10,validity:60,description:"Ten standard court sessions.",status:"active"},
    {title:"Premium 20 Sessions",price:320000,sessions:20,validity:90,description:"Premium court access for regular players.",status:"active"}
  ]});
  await prisma.gymPackage.createMany({data:[
    {title:"Open Gym",price:100000,duration:30,description:"Unlimited gym access.",benefits:["Gym access","Locker"],status:"active"},
    {title:"Athlete",price:250000,duration:30,description:"Performance membership.",benefits:["Gym","Testing","Coach consultation"],status:"active"},
    {title:"Premium",price:350000,duration:30,description:"Full performance access.",benefits:["Everything in Athlete","PT","Recovery"],status:"active"}
  ]});

  await prisma.membership.createMany({data:[
    {customerId:member.id,userId:member.id,customer:member.name,phone:member.phone||"",packageId:"gp2",package:"Athlete",startDate:"2026-09-01",expiryDate:"2026-09-30",status:"active",lastCheckIn:"2026-09-28 18:10"},
    {customerId:"u2",customer:"Htet Aung",phone:"09 432 118 210",packageId:"gp3",package:"Premium",startDate:"2026-09-10",expiryDate:"2026-10-10",status:"active",lastCheckIn:"2026-09-27 17:45"}
  ]});

  const cb=await prisma.booking.create({data:{code:"ZW-20260928-001",userId:member.id,kind:"court",title:"Court 03",date:"2026-09-28",time:"6:30 PM — 7:30 PM",location:"Indoor Court",status:"confirmed",price:15000,courtId:courtRows[2].id,paymentStatus:"paid"}});
  await prisma.booking.create({data:{code:"ZW-20260929-002",userId:member.id,kind:"pt",title:"Session with Coach Alex",date:"2026-09-29",time:"6:30 PM — 7:30 PM",location:"High Performance Gym",status:"confirmed",price:30000,coachId:coach.id,paymentStatus:"pending"}});
  await prisma.appointment.createMany({data:[
    {userId:member.id,doctorId:doctor.id,patient:member.name,doctor:doctorUser.name,date:"2026-09-29",time:"6:00 PM",type:"Physio Assessment",status:"pending",paymentStatus:"pending",notes:"Movement screen and follow-up."},
    {userId:member.id,doctorId:doctor.id,patient:member.name,doctor:doctorUser.name,date:"2026-09-30",time:"4:30 PM",type:"Physiotherapy",status:"confirmed",paymentStatus:"paid"}
  ]});
  await prisma.product.createMany({data:[
    {name:"Zawana Training Tee",price:45000,category:"Apparel",description:"Technical training tee.",sku:"ZAW-TEE-01",barcode:"890000000001",stock:24,cost:25000,tax:0,status:"active"},
    {name:"Performance Shorts",price:55000,category:"Apparel",description:"Lightweight court shorts.",sku:"ZAW-SHT-01",barcode:"890000000002",stock:8,cost:30000,tax:0,status:"active"},
    {name:"Training Bands",price:25000,category:"Training",description:"Resistance band set.",sku:"ZAW-BND-01",barcode:"890000000003",stock:4,cost:12000,tax:0,status:"active"}
  ]});
  await prisma.student.create({data:{name:"Aung Min",phone:"09 555 123 444",className:"Junior Academy",coach:"Coach Min",package:"10 Sessions",paymentStatus:"paid",attendance:92,expiryDate:"2026-10-29",status:"active"}});
  await prisma.transaction.createMany({data:[
    {date:"2026-09-29",customer:"Sai Zay",business:"Gym",item:"Athlete Membership",amount:250000,discount:0,tax:0,finalAmount:250000,paymentMethod:"KPay",staff:"Gym FO",status:"paid"},
    {date:"2026-09-29",customer:"Htet Aung",business:"Clinic",item:"Physio Assessment",amount:45000,discount:0,tax:0,finalAmount:45000,paymentMethod:"Cash",staff:"Clinic FO",status:"paid"},
    {date:"2026-09-29",customer:"Su Myat Thiri",business:"Cafe",item:"Cafe Order",amount:14000,discount:0,tax:0,finalAmount:14000,paymentMethod:"Cash",staff:"Cafe FO",status:"paid"}
  ]});
  await prisma.contentItem.create({data:{title:"September Community Challenge",image:"/facilities/gym.webp",description:"Train together this September.",googleFormLink:"https://forms.google.com/",status:"published",publishDate:"2026-09-29"}});
  await prisma.notification.createMany({data:[
    {userId:member.id,title:"Booking confirmed",body:"Your court booking has been confirmed.",read:false,audience:"member",type:"booking",link:"/bookings"},
    {userId:null,title:"System maintenance",body:"Zawana booking services will receive scheduled maintenance tonight.",read:true,audience:"all",type:"system"}
  ]});
  console.log("Zawana seed complete");
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
