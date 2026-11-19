import { operationalReasons } from '../domain/rescheduleReasons.js';
import { previewRefundBatch, completeRefundBatch, completeRefund, refundDetails, listRefunds, memberRefunds, refundInput, deliverRefundNotifications } from '../services/bookingRefunds.js';
import { removeClassOccurrences, removeWeeklyClasses } from '../services/weeklyRemoval.js';
import { cancelStaffRequest, staffBookingDetail, createStaffRequest, createStaffRequests, listBookingRequests, customerRequestAction, quoteCustomerRequest, requestAvailability, confirmCustomerRequest } from '../services/bookingRequests.js';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { quoteDeskMoves, confirmDeskMoves, moveInput } from '../services/deskMoves.js';
import { privateReplacementAvailability, listPrivateReschedules, invitePrivateReschedule, proposePrivateReschedule, decidePrivateReschedule } from '../services/privateRescheduling.js';
import { deskPaymentInput } from '../services/deskPayment.js';
export function createReschedulingRouter(db: PrismaClient, authenticate = auth) {
  const r = Router();
  r.use(authenticate, roles('member', 'coach', 'admin', 'badminton_fo'));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  r.post('/moves/quote', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => res.json(await quoteDeskMoves(db, req.user!, moveInput.extend({ reason: z.enum(operationalReasons) }).parse(req.body)))));
  r.post('/moves/confirm', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ input: moveInput.extend({ reason: z.enum(operationalReasons) }), revision: z.string().min(1), requestKey: z.string().uuid(), payment: deskPaymentInput.optional() }).strict().parse(req.body);
    res.json(await confirmDeskMoves(db, req.user!, b.input, b.revision, b.requestKey, b.payment));
  }));
  r.post('/refunds/preview', roles('admin','badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ bookingIds: z.array(z.string().min(1)).min(1).max(30) }).strict().parse(req.body);
    res.json(await previewRefundBatch(db, req.user!, input.bookingIds));
  }));
  r.post('/refunds/complete-batch', roles('admin','badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ items: z.array(z.object({ bookingId: z.string().min(1), input: z.unknown() }).strict()).min(1).max(30) }).strict().parse(req.body);
    res.json(await completeRefundBatch(db, req.user!, input.items));
  }));
  r.get('/refunds', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>{await deliverRefundNotifications(db);res.json(await listRefunds(db,req.user!));}));
  r.get('/refunds/mine', roles('member'), asyncRoute(async(req:AuthRequest,res)=>res.json(await memberRefunds(db,req.user!))));
  r.get('/refunds/bookings/:id', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>res.json(await refundDetails(db,req.user!,String(req.params.id)))));
  r.post('/refunds/bookings/:id/complete', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>res.json(await completeRefund(db,req.user!,String(req.params.id),refundInput.parse(req.body)))));
  r.post('/weekly/remove-occurrences', roles('admin','badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ occurrences: z.array(z.object({ id: z.string().min(1), date: z.string() }).strict()).min(1).max(30), requestKey: z.string().uuid() }).strict().parse(req.body);
    res.json(await removeClassOccurrences(db, req.user!, input.occurrences, input.requestKey));
  }));
  r.post('/weekly/remove', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>{const b=z.object({blockIds:z.array(z.string().min(1)).min(1).max(30),requestKey:z.string().uuid()}).strict().parse(req.body);res.json(await removeWeeklyClasses(db,req.user!,b.blockIds,b.requestKey));}));
  r.get('/bookings/:id/details', roles('admin', 'badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>res.json(await staffBookingDetail(db,req.user!,String(req.params.id)))));
  r.get('/requests', asyncRoute(async(req:AuthRequest,res)=>res.json(await listBookingRequests(db,req.user!))));
  r.post('/requests', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>{const b=z.object({bookingId:z.string().min(1),reason:z.enum(operationalReasons),notes:z.string().trim().max(1000).default('')}).strict().parse(req.body);res.status(201).json(await createStaffRequest(db,req.user!,b.bookingId,b.reason,b.notes));}));
  r.post('/requests/batch', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>{const b=z.object({bookingIds:z.array(z.string().min(1)).min(1).max(30),requestKey:z.string().uuid().optional(),reason:z.enum(operationalReasons),notes:z.string().trim().max(1000).default('')}).strict().parse(req.body);res.status(201).json(await createStaffRequests(db,req.user!,b.bookingIds,b.reason,b.notes,b.requestKey));}));
  r.post('/requests/:id/cancel', roles('admin','badminton_fo'), asyncRoute(async(req:AuthRequest,res)=>res.json(await cancelStaffRequest(db,req.user!,String(req.params.id)))));
  r.post('/requests/:id/respond', roles('member'), asyncRoute(async(req:AuthRequest,res)=>{const b=z.object({action:z.enum(['ADMIN_HANDLING','REFUND_REQUESTED','DECLINED'])}).strict().parse(req.body);res.json(await customerRequestAction(db,req.user!,String(req.params.id),b.action));}));
  const customerTarget=z.object({courtId:z.string().min(1),date:z.string(),time:z.string()}).strict();
  r.get('/requests/:id/availability', roles('member'), asyncRoute(async(req:AuthRequest,res)=>res.json(await requestAvailability(db,req.user!,String(req.params.id),String(req.query.date||''),String(req.query.courtId||'')))));
  r.post('/requests/:id/quote', roles('member'), asyncRoute(async(req:AuthRequest,res)=>res.json(await quoteCustomerRequest(db,req.user!,String(req.params.id),customerTarget.parse(req.body)))));
  r.post('/requests/:id/confirm', roles('member'), asyncRoute(async(req:AuthRequest,res)=>{
    const b=z.object({target:customerTarget,revision:z.string().min(1),acknowledged:z.boolean().default(false)}).strict().parse(req.body),id=String(req.params.id);
    const row=await db.bookingRescheduleRequest.findFirst({where:{id,customerId:req.user!.id}});if(!row)return res.status(404).json({message:'Request not found.'});
    if(row.kind==='private_course'){
      const q=await quoteCustomerRequest(db,req.user!,id,b.target);if(q.revision!==b.revision)return res.status(409).json({message:'Review a fresh quote.'});
      await proposePrivateReschedule(db,req.user!,row.bookingId,{...b.target,reason:row.reason||'Customer responded to staff request',staffRequestId:id});
      return res.json(await db.bookingRescheduleRequest.findUnique({where:{id}}));
    }
    res.json(await confirmCustomerRequest(db,req.user!,id,b.target,b.revision,b.acknowledged));
  }));
  r.get('/private', asyncRoute(async (req: AuthRequest, res) => res.json(await listPrivateReschedules(db, req.user!, req.query.bookingId ? String(req.query.bookingId) : undefined))));
  r.post('/private/:bookingId/invite', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => res.json(await invitePrivateReschedule(db, req.user!, String(req.params.bookingId), z.object({ reason: z.enum(operationalReasons) }).strict().parse(req.body).reason))));
  r.get('/private/:bookingId/availability', roles('member'), asyncRoute(async (req: AuthRequest, res) => res.json(await privateReplacementAvailability(db, req.user!, String(req.params.bookingId), String(req.query.date || ''), String(req.query.courtId || '')))));
  r.post('/private/:bookingId/proposals', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ courtId: z.string().min(1), date: z.string(), time: z.string(), reason: z.string().trim().min(3).max(1000) }).strict().parse(req.body);
    res.status(201).json(await proposePrivateReschedule(db, req.user!, String(req.params.bookingId), b));
  }));
  r.post('/private/proposals/:id/decision', roles('member', 'coach'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ decision: z.enum(['approve', 'reject', 'withdraw']), reason: z.string().trim().min(3).max(1000) }).strict().parse(req.body);
    res.json(await decidePrivateReschedule(db, req.user!, String(req.params.id), b.decision, b.reason));
  }));
  return r;
}
