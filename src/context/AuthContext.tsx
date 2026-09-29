
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types";
import { api, get, post, setToken, getToken, type AuthResponse } from "../api";

type Ctx = {
  user: User | null;
  loading: boolean;
  login:(email:string,password:string)=>Promise<boolean>;
  logout:()=>void;
  signup:(name:string,email:string,password:string)=>Promise<void>;
};

const C=createContext<Ctx|null>(null);

export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!getToken()){setLoading(false);return;}
    get<User>("/auth/me").then(setUser).catch(()=>setToken(null)).finally(()=>setLoading(false));
  },[]);

  const login=async(email:string,password:string)=>{
    try {
      const result=await post<AuthResponse>("/auth/login",{email,password});
      setToken(result.token); setUser(result.user); return true;
    } catch { return false; }
  };

  const signup=async(name:string,email:string,password:string)=>{
    const result=await post<AuthResponse>("/auth/register",{name,email,password});
    setToken(result.token); setUser(result.user);
  };

  const logout=()=>{setToken(null);setUser(null)};

  return <C.Provider value={{user,loading,login,logout,signup}}>{children}</C.Provider>;
}
export const useAuth=()=>{const c=useContext(C);if(!c)throw Error("AuthProvider missing");return c};
