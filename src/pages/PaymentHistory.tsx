import { useEffect, useState } from "react";
import { CreditCard, ReceiptText, Search } from "lucide-react";
import { Badge, Button, Card, Empty, Page, Pagination } from "../components/UI";
import { get } from "../api";

type Transaction = {
  id: string;
  date: string;
  item: string;
  business: string;
  finalAmount: number;
  status: string;
  paymentMethod: string
};

export default function PaymentHistory() {
  const [rows, setRows] = useState<Transaction[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    get<any>(`/transactions?${params}`)
      .then(r => {
        if (!active) return;
        setRows(r.data || []);
        setTotal(r.pagination?.total || 0);
        setTotalPages(r.pagination?.totalPages || 0);
        setError("")
      })
      .catch((e: any) => {
        if (active) setError(e.message || "Could not load your payment history.")
      })
      .finally(() => {
        if (active) setLoading(false)
      });
    return () => {
      active = false
    }
  }, [page, query, status, from, to]);
  const searchNow = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim())
  };
  return <Page title="Payments & receipts" eyebrow="Your account">
    <Card className="mb-5 p-4">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={searchNow}>
        <label className="relative sm:col-span-2 lg:col-span-2">
          <Search size={16} className="absolute left-3 top-3.5 text-zawana-400" />
          <input
            aria-label="Search payments"
            className="w-full pl-9"
            placeholder="Search receipt or item"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter payment status"
          value={status}
          onChange={e => {
            setPage(1);
            setStatus(e.target.value)
          }}
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
        </select>
        <input
          aria-label="From date"
          type="date"
          value={from}
          onChange={e => {
            setPage(1);
            setFrom(e.target.value)
          }}
        />
        <input
          aria-label="To date"
          type="date"
          value={to}
          onChange={e => {
            setPage(1);
            setTo(e.target.value)
          }}
        />
        <Button className="sm:col-span-2 lg:col-span-5">
          <Search size={15} /> Search payments</Button>
      </form>
    </Card>
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>}
    {loading ?
      <div className="grid animate-pulse gap-3">
        {[0, 1, 2].map(i =>
          <Card key={i} className="h-20 bg-zawana-950/5" />
        )}
      </div> : rows.length ?
      <>
        <div className="space-y-3">
          {rows.map(r =>
            <Card
              key={r.id}
              className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-zawana-accent/15">
                  <ReceiptText size={18} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-zawana-500">
                    {r.business} · {r.date}
                  </p>
                  <h2 className="mt-1 font-black">{r.item}</h2>
                  <p className="mt-1 text-xs text-zawana-500">
                    {r.id} · {r.paymentMethod}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <b className="text-lg">{Number(r.finalAmount).toLocaleString()} MMK</b>
                <Badge good={r.status === "paid"}>{r.status}</Badge>
              </div>
            </Card>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </> :
      <Empty
        title="No payment history found"
        body="Your account-linked purchases and completed payments will appear here."
      />}
    <div className="mt-5 flex items-center gap-2 text-xs text-zawana-500">
      <CreditCard size={14} /> Payment records are connected to your Zawana account.</div>
  </Page>
}
