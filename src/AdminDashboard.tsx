import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ClipboardList, ChefHat, RefreshCw, ExternalLink, CheckCircle, Clock } from "lucide-react";

type AdminOrder = {
  id: string;
  order_number?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  delivery_address?: string | { address?: string } | null;
  total: number;
  order_status: string;
  payment_status?: string | null;
  payment_method?: string | null;
  customer_note?: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  order_id: string;
  status?: string | null;
  receipt_url?: string | null;
  amount?: number | null;
  transfer_reference?: string | null;
  signedReceipt?: string | null;
};

const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const pretty = (value?: string | null) => (value || "Not set").replace(/_/g, " ");

export default function AdminDashboard({ userId, productCount }: { userId: string; productCount: number }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_number,customer_name,customer_phone,delivery_address,total,order_status,payment_status,payment_method,customer_note,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setNotice("Could not load orders: " + error.message);
      setLoading(false);
      return;
    }

    const orderRows = (data || []) as AdminOrder[];
    setOrders(orderRows);

    if (orderRows.length) {
      const { data: paymentRows, error: paymentError } = await supabase
        .from("payments")
        .select("id,order_id,status,receipt_url,amount,transfer_reference")
        .in("order_id", orderRows.map(order => order.id));

      if (paymentError) {
        setNotice("Orders loaded, but payment details could not be loaded: " + paymentError.message);
        setPayments([]);
      } else {
        const withReceipts = await Promise.all((paymentRows || []).map(async (payment: Payment) => {
          if (!payment.receipt_url) return payment;
          const { data: signed } = await supabase.storage
            .from("payment-receipts")
            .createSignedUrl(payment.receipt_url, 3600);
          return { ...payment, signedReceipt: signed?.signedUrl || null };
        }));
        setPayments(withReceipts);
      }
    } else {
      setPayments([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    setBusyId(orderId);
    setNotice("");
    const { error } = await supabase
      .from("orders")
      .update({ order_status: status })
      .eq("id", orderId);

    if (error) setNotice("Order update failed: " + error.message);
    else setNotice("Order status updated to " + pretty(status) + ".");
    await loadDashboard();
    setBusyId("");
  };

  const confirmTransfer = async (orderId: string) => {
    const payment = payments.find(item => item.order_id === orderId);
    if (!payment) {
      setNotice("No payment record was found for this order. The transfer has not been marked as paid.");
      return;
    }

    setBusyId(orderId);
    setNotice("");
    const verifiedAt = new Date().toISOString();
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ status: "paid", verified_by: userId, verified_at: verifiedAt, paid_at: verifiedAt })
      .eq("order_id", orderId);

    if (paymentError) {
      setNotice("Payment verification failed: " + paymentError.message);
      setBusyId("");
      return;
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", orderId);

    if (orderError) setNotice("Payment was recorded, but the order payment status could not be updated: " + orderError.message);
    else setNotice("Transfer marked as received. You can now approve this order.");
    await loadDashboard();
    setBusyId("");
  };

  const filteredOrders = orders.filter(order => {
    if (filter === "all") return true;
    if (filter === "pending") return order.order_status === "pending_approval";
    if (filter === "bank") return order.payment_method === "bank_transfer";
    if (filter === "unpaid") return order.payment_status !== "paid";
    return order.order_status === filter;
  });

  const pendingCount = orders.filter(order => order.order_status === "pending_approval").length;
  const bankPendingCount = orders.filter(order => order.payment_method === "bank_transfer" && order.payment_status !== "paid").length;

  return (
    <section className="admin-dashboard">
      <div className="stats">
        <div className="panel"><ClipboardList /><b>{orders.length}</b><span>Recent orders</span></div>
        <div className="panel"><Clock /><b>{pendingCount}</b><span>Awaiting approval</span></div>
        <div className="panel"><CheckCircle /><b>{bankPendingCount}</b><span>Transfers to verify</span></div>
        <div className="panel"><ChefHat /><b>{productCount}</b><span>Menu items</span></div>
      </div>

      {notice && <div className="toast admin-notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      <div className="admin-toolbar">
        <h2 className="section-heading">Order management</h2>
        <button className="outline-btn" onClick={() => void loadDashboard()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh orders"}
        </button>
      </div>

      <div className="admin-filters">
        {[
          ["all", "All orders"],
          ["pending", "Awaiting approval"],
          ["bank", "Bank transfers"],
          ["unpaid", "Unpaid"]
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      {loading ? <p className="muted">Loading orders…</p> : filteredOrders.length === 0 ? (
        <div className="panel empty"><ClipboardList size={28} /><h3>No orders found</h3><p>Orders matching this filter will appear here.</p></div>
      ) : filteredOrders.map(order => {
        const payment = payments.find(item => item.order_id === order.id);
        const isBankTransfer = order.payment_method === "bank_transfer";
        const isPaid = order.payment_status === "paid" || payment?.status === "paid";
        const address = typeof order.delivery_address === "string"
          ? order.delivery_address
          : order.delivery_address?.address || "No delivery address supplied";

        return (
          <article className="panel admin-order-card" key={order.id}>
            <div className="admin-order-heading">
              <div>
                <b>Order #{order.order_number || order.id.slice(0, 8)}</b>
                <p>{new Date(order.created_at).toLocaleString()}</p>
              </div>
              <span className="status">{pretty(order.order_status)}</span>
            </div>

            <div className="admin-order-details">
              <p><b>Customer:</b> {order.customer_name || "Customer"}</p>
              <p><b>Phone:</b> {order.customer_phone || "Not provided"}</p>
              <p><b>Delivery address:</b> {address}</p>
              {order.customer_note && <p><b>Customer note:</b> {order.customer_note}</p>}
              <p><b>Payment method:</b> {pretty(order.payment_method)}</p>
              <p><b>Payment status:</b> <span className={isPaid ? "payment-paid" : "payment-pending"}>{isPaid ? "Paid / verified" : pretty(order.payment_status || payment?.status || "pending")}</span></p>
              <p className="admin-order-total">{money(Number(order.total))}</p>
            </div>

            {isBankTransfer && (
              <div className="payment-review">
                <b>Bank transfer review</b>
                {payment?.transfer_reference && <p>Transfer reference: {payment.transfer_reference}</p>}
                {payment?.signedReceipt ? (
                  <a className="receipt-link" href={payment.signedReceipt} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> View uploaded receipt
                  </a>
                ) : <p className="muted">No receipt uploaded. Check the restaurant bank account before confirming payment.</p>}
                {!isPaid && (
                  <button className="outline-btn" disabled={busyId === order.id} onClick={() => void confirmTransfer(order.id)}>
                    {busyId === order.id ? "Please wait…" : "Confirm payment received"}
                  </button>
                )}
              </div>
            )}

            <div className="status-actions admin-status-actions">
              {order.order_status === "pending_approval" && (
                <>
                  <button disabled={busyId === order.id || (isBankTransfer && !isPaid)} onClick={() => void updateOrderStatus(order.id, "approved")}>
                    {isBankTransfer && !isPaid ? "Verify payment before approval" : "Approve order"}
                  </button>
                  <button disabled={busyId === order.id} onClick={() => void updateOrderStatus(order.id, "rejected")}>Reject</button>
                </>
              )}
              {order.order_status === "approved" && <button disabled={busyId === order.id} onClick={() => void updateOrderStatus(order.id, "preparing")}>Start preparing</button>}
              {order.order_status === "preparing" && <button disabled={busyId === order.id} onClick={() => void updateOrderStatus(order.id, "ready")}>Mark ready</button>}
              {order.order_status === "ready" && <button disabled={busyId === order.id} onClick={() => void updateOrderStatus(order.id, "out_for_delivery")}>Dispatch order</button>}
              {order.order_status === "out_for_delivery" && <button disabled={busyId === order.id} onClick={() => void updateOrderStatus(order.id, "delivered")}>Mark delivered</button>}
              {busyId === order.id && <span className="muted">Saving…</span>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
