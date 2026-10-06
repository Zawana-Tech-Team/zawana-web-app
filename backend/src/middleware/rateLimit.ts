import type { NextFunction, Request, Response } from "express";

export function createRateLimit({windowMs,maxAttempts}:{windowMs:number;maxAttempts:number}){
  const attempts=new Map<string,{count:number;resetAt:number}>();
  return (req:Request,res:Response,next:NextFunction)=>{
    const now=Date.now();
    const key=`${req.path}:${req.ip||req.socket.remoteAddress||"unknown"}`;
    const current=attempts.get(key);
    if(attempts.size>5000)for(const [entry,value] of attempts)if(value.resetAt<=now)attempts.delete(entry);
    if(!current||current.resetAt<=now){attempts.set(key,{count:1,resetAt:now+windowMs});return next();}
    if(current.count>=maxAttempts){res.setHeader("Retry-After",String(Math.ceil((current.resetAt-now)/1000)));return res.status(429).json({message:"Too many authentication attempts. Wait and try again."});}
    current.count++;
    next();
  };
}
