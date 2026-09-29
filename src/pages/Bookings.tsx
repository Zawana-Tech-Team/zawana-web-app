
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Badge, Page, Empty } from "../components/UI";
import { get, patch } from "../api";

export function Bookings(){
 const [bookings,setBookings]=useState<any[]>([]); const [loading,setLoading]=useState(true);
 const load=()=>get<any[]>("/bookings").then(setBookings).finally(()=>setLoading(false));
 useEffect(()=>{load()},[]);
 const cancel=async(id:string)=>{await patch(`/bookings/${id}/status`,{status:"cancelled"});load()};
 return <Page title="My bookings" eyebrow="Schedule">{loading?<Card className="p-8">Loading bookings…</Card>:<div className="space-y-3">{bookings.map(b=><Card key={b.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><h3 className="font-black">{b.title}</h3><Badge good={b.status==="confirmed"}>{b.status}</Badge></div><p className="mt-2 text-sm text-zawana-500">{b.date} · {b.time} · {b.location}</p><p className="mt-1 text-xs text-zawana-500">{b.code}</p></div><div className="flex gap-2"><Button variant="secondary">View</Button>{b.status==="confirmed"&&<Button variant="danger" onClick={()=>cancel(b.id)}>Cancel</Button>}</div></div></Card>)}{!bookings.length&&<Empty title="No upcoming bookings" body="Your next session starts with a court, class or recovery booking." action={<Link to="/book"><Button>Book now</Button></Link>}/>}</div>}</Page>
}
