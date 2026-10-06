import type { NextFunction, Response } from "express";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.js";
import { verifyDatabaseToken } from "../services/databaseSession.js";
import { env } from "../config/env.js";
import type { AuthRequest, AuthUser } from "../types/auth.js";

export function auth(req:AuthRequest,res:Response,next:NextFunction){
  const header=req.headers.authorization;
  if(!header?.startsWith("Bearer "))return res.status(401).json({message:"Authentication required"});
  if(env.databaseAuthEnabled){
    const claims=verifyDatabaseToken(header.slice(7));
    if(!claims)return res.status(401).json({message:"Your session expired. Sign in again."});
    void prisma.user.findUnique({where:{id:claims.sub},select:{id:true,role:true,email:true,name:true,phone:true,avatar:true,active:true}}).then(user=>{
      if(!user||!user.active)return res.status(401).json({message:"This account is inactive or no longer exists."});
      req.user={id:user.id,role:user.role,email:user.email,name:user.name,phone:user.phone,avatar:user.avatar};
      next();
    }).catch(next);
    return;
  }
  void verifyFirebaseIdToken(header.slice(7)).then(async claims=>{
    const user=await prisma.user.findUnique({where:{firebaseUid:claims.uid},select:{id:true,role:true,email:true,name:true,phone:true,avatar:true,active:true}});
    if(!user||!user.active)return res.status(401).json({message:"Firebase identity is not linked to an active Zawana account."});
    req.firebaseClaims=claims;
    req.user={id:user.id,role:user.role,email:user.email,name:user.name,phone:user.phone,avatar:user.avatar};
    next();
  }).catch((error:any)=>{
    if(error?.statusCode===503)return res.status(503).json({message:error.message});
    return res.status(401).json({message:"Invalid, expired, or revoked Firebase ID token."});
  });
}

export function roles(...allowed:Role[]){return(req:AuthRequest,res:Response,next:NextFunction)=>{
  const user=req.user as AuthUser|undefined;
  if(!user||!allowed.includes(user.role))return res.status(403).json({message:"Insufficient permissions"});
  next();
};}
