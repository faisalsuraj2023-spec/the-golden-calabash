import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseReady } from "./supabase";
import { ShoppingBag, Utensils, User, LogOut, Plus, Minus, X, ShieldCheck, ClipboardList, ChefHat } from "lucide-react";

type Product = { id: string; name: string; description?: string; price: number; image_url?: string | null; category_id?: string | null; is_available?: boolean };
type CartItem = { product: Product; quantity: number };
type Order = { id: string; status: string; total_amount: number; created_at: string; payment_method?: string };

const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<"home"|"menu"|"account"|"admin">("home");
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"login"|"signup">("login");
  const [auth, setAuth] = useState({ name:"", email:"", password:"" });
  const [checkout, setCheckout] = useState({ name:"", phone:"", address:"", note:"", method:"cash_on_delivery" });
  const [receipt, setReceipt] = useState<File|null>(null);

  useEffect(() => {
    if (!supabaseReady) return;
    loadProducts();
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) { checkAdmin(); loadOrders(); } else { setIsAdmin(false); setOrders([]); } }, [user]);

  async function loadProducts() {
    const { data, error } = await supabase.from("products").select("*").eq("is_available", true).order("created_at", { ascending: false });
    if (!error && data) setProducts(data as Product[]);
  }
  async function checkAdmin() {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    setIsAdmin(Boolean(data));
  }
  async function loadOrders() {
    const { data } = await supabase.from("orders").select("id,status,total_amount,created_at,payment_method").order("created_at", { ascending: false }).limit(30);
    if (data) setOrders(data as Order[]);
  }
  function add(product: Product) {
    setCart(old => {
      const found = old.find(i => i.product.id === product.id);
      return found ? old.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i) : [...old, { product, quantity: 1 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart(old => old.map(i => i.product.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));
  }
  const total = useMemo(() => cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0), [cart]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email: auth.email, password: auth.password, options: { data: { full_name: auth.name } } })
      : await supabase.auth.signInWithPassword({ email: auth.email, password: auth.password });
    setBusy(false);
    setMessage(result.error?.message || (authMode === "signup" ? "Account created. Check your email if confirmation is enabled." : "Signed in successfully."));
    if (!result.error && authMode === "login") setPage("account");
  }
  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setMessage("Please sign in or create an account before checkout."); setPage("account"); return; }
    if (!cart.length) return;
    setBusy(true); setMessage("");
    const items = cart.map(i => ({ product_id: i.product.id, quantity: i.quantity }));
    const { data, error } = await supabase.rpc("create_restaurant_order", {
      p_customer_name: checkout.name, p_customer_phone: checkout.phone,
      p_delivery_address: { address: checkout.address },
      p_items: items, p_payment_method: checkout.method, p_customer_note: checkout.note || null
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    const orderId = typeof data === "string" ? data : data?.order_id || data?.id;
    if (checkout.method === "bank_transfer" && receipt && orderId) {
      const path = `${user.id}/${orderId}/${Date.now()}-${receipt.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await supabase.storage.from("payment-receipts").upload(path, receipt, { upsert: false });
      if (!upload.error) {
        await supabase.from("payments").update({ receipt_path: path }).eq("order_id", orderId);
      } else {
        setMessage("Order placed, but receipt upload failed. Open your order and try again or contact the restaurant.");
      }
    }
    setCart([]); await loadOrders(); setBusy(false);
    setMessage("Your order has been submitted for restaurant approval. You can track it in your account.");
    setCartOpen(false); setPage("account");
  }
  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    setMessage(error?.message || "Order status updated."); loadOrders();
  }
  async function signOut() { await supabase.auth.signOut(); setPage("home"); }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={() => setPage("home")}><span className="brand-mark">G</span><span>THE GOLDEN<br/><b>CALABASH</b></span></a>
      <nav><button onClick={() => setPage("home")}>Home</button><button onClick={() => setPage("menu")}>Our Menu</button><button onClick={() => setPage("account")}>My Account</button>{isAdmin && <button onClick={() => setPage("admin")}>Admin</button>}</nav>
      <div className="actions"><button className="icon-btn" onClick={() => setCartOpen(true)} aria-label="Open cart"><ShoppingBag size={19}/><span className="count">{cart.reduce((s,i)=>s+i.quantity,0)}</span></button>{user ? <button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={19}/></button> : <button className="gold-btn small" onClick={() => setPage("account")}>Sign in</button>}</div>
    </header>

    {!supabaseReady && <div className="notice">Connect your Supabase project by adding the two VITE variables in your .env file. See README.md.</div>}
    {message && <div className="toast"><span>{message}</span><button onClick={() => setMessage("")}><X size={16}/></button></div>}

    {page === "home" && <main>
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow">A TASTE OF NIGERIAN HERITAGE</p><h1>Good food.<br/><em>Golden</em> moments.</h1><p className="hero-text">A warm table, generous flavours and the Nigerian dishes you love — thoughtfully prepared and served with care.</p><button className="gold-btn" onClick={() => setPage("menu")}>Explore our menu <span>→</span></button><div className="hero-note"><span className="dot"/> Freshly prepared · Made with care</div></div>
        <div className="hero-art"><div className="plate"><div className="plate-inner"><span>THE GOLDEN</span><b>CALABASH</b><small>AUTHENTIC FLAVOUR</small></div></div><div className="art-caption">TRADITION, SERVED BEAUTIFULLY</div></div>
      </section>
      <section className="intro"><p className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</p><h2>Flavours worth<br/>coming back for.</h2><p>Discover comforting classics and satisfying favourites made for sharing.</p><button className="text-link" onClick={() => setPage("menu")}>VIEW THE MENU ↗</button></section>
      <MenuGrid products={products.slice(0,3)} add={add}/>
    </main>}

    {page === "menu" && <main className="content-page"><p className="eyebrow">MADE FRESH FOR YOU</p><h1 className="page-title">Our Menu</h1><p className="muted">Choose your favourites and add them to your bag.</p><MenuGrid products={products} add={add}/></main>}

    {page === "account" && <main className="content-page narrow"><p className="eyebrow">YOUR GOLDEN CALABASH</p><h1 className="page-title">{user ? "Your account" : "Welcome back"}</h1>{!user ? <form className="panel form" onSubmit={submitAuth}><div className="tabs"><button type="button" className={authMode==="login"?"active":""} onClick={()=>setAuthMode("login")}>Sign in</button><button type="button" className={authMode==="signup"?"active":""} onClick={()=>setAuthMode("signup")}>Create account</button></div>{authMode==="signup" && <label>Full name<input required value={auth.name} onChange={e=>setAuth({...auth,name:e.target.value})}/></label>}<label>Email address<input type="email" required value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/></label><label>Password<input type="password" minLength={6} required value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/></label><button className="gold-btn full" disabled={busy}>{busy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button></form> : <><div className="panel"><p>Signed in as <b>{user.email}</b></p><button className="outline-btn" onClick={signOut}>Sign out</button></div><h2 className="section-heading">Your recent orders</h2>{orders.length ? orders.map(o=><OrderCard key={o.id} order={o}/>) : <p className="muted">Your orders will appear here.</p>}</>}</main>}

    {page === "admin" && <main className="content-page"><p className="eyebrow"><ShieldCheck size={14}/> RESTAURANT MANAGEMENT</p><h1 className="page-title">Admin dashboard</h1>{!isAdmin ? <p className="muted">This account does not have administrator access.</p> : <><div className="stats"><div className="panel"><ClipboardList/><b>{orders.length}</b><span>Recent orders</span></div><div className="panel"><ChefHat/><b>{products.length}</b><span>Menu items</span></div></div><h2 className="section-heading">Order management</h2>{orders.map(o=><div className="panel admin-order" key={o.id}><div><b>#{o.id.slice(0,8)}</b><p>{money(o.total_amount)} · {o.payment_method?.replaceAll("_"," ")}</p><span className="status">{o.status}</span></div><div className="status-actions"><button onClick={()=>updateStatus(o.id,"approved")}>Approve</button><button onClick={()=>updateStatus(o.id,"preparing")}>Preparing</button><button onClick={()=>updateStatus(o.id,"ready")}>Ready</button><button onClick={()=>updateStatus(o.id,"out_for_delivery")}>Dispatch</button><button onClick={()=>updateStatus(o.id,"delivered")}>Delivered</button><button onClick={()=>updateStatus(o.id,"rejected")}>Reject</button></div></div>)}</>}</main>}

    {cartOpen && <div className="drawer-backdrop" onClick={()=>setCartOpen(false)}><aside className="drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><h2>Your bag</h2><button className="icon-btn" onClick={()=>setCartOpen(false)}><X/></button></div>{cart.length===0?<p className="muted">Your bag is waiting for something delicious.</p>:<>{cart.map(i=><div className="cart-row" key={i.product.id}><div><b>{i.product.name}</b><p>{money(Number(i.product.price))}</p><div className="qty"><button onClick={()=>changeQty(i.product.id,-1)}><Minus size={14}/></button><span>{i.quantity}</span><button onClick={()=>changeQty(i.product.id,1)}><Plus size={14}/></button></div></div><b>{money(Number(i.product.price)*i.quantity)}</b></div>)}<div className="total-row"><span>Subtotal</span><b>{money(total)}</b></div><form className="form checkout" onSubmit={placeOrder}><h3>Delivery details</h3><label>Full name<input required value={checkout.name} onChange={e=>setCheckout({...checkout,name:e.target.value})}/></label><label>Phone number<input required value={checkout.phone} onChange={e=>setCheckout({...checkout,phone:e.target.value})}/></label><label>Delivery address<textarea required value={checkout.address} onChange={e=>setCheckout({...checkout,address:e.target.value})}/></label><label>Order note (optional)<textarea value={checkout.note} onChange={e=>setCheckout({...checkout,note:e.target.value})}/></label><label>Payment method<select value={checkout.method} onChange={e=>setCheckout({...checkout,method:e.target.value})}><option value="cash_on_delivery">Cash on delivery</option><option value="bank_transfer">Bank transfer</option></select></label>{checkout.method==="bank_transfer" && <div className="transfer-note"><b>Bank transfer</b><p>Verified business bank details will be shown here once the restaurant owner adds them in settings. Do not transfer to an unverified account.</p><label>Upload transfer receipt<input type="file" accept="image/*,.pdf" onChange={e=>setReceipt(e.target.files?.[0]||null)}/></label></div>}<button className="gold-btn full" disabled={busy}>{busy?"Submitting…":`Place order · ${money(total)}`}</button><small>Your order must be approved by the restaurant before preparation.</small></form></>}</aside></div>}
    <footer><div className="brand"><span className="brand-mark">G</span><span>THE GOLDEN<br/><b>CALABASH</b></span></div><p>Good food. Golden moments.</p><small>© {new Date().getFullYear()} THE GOLDEN CALABASH · Nigeria</small></footer>
  </div>;
}

function MenuGrid({products,add}:{products:Product[];add:(p:Product)=>void}) {
  if (!products.length) return <div className="empty panel"><Utensils size={28}/><h3>Our menu is being prepared</h3><p>Menu items added by the restaurant will appear here.</p></div>;
  return <div className="menu-grid">{products.map(p=><article className="food-card" key={p.id}><div className="food-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<div className="food-placeholder"><Utensils size={34}/><span>FRESHLY PREPARED</span></div>}</div><div className="food-info"><div><h3>{p.name}</h3><p>{p.description||"Prepared fresh with care."}</p></div><div className="food-bottom"><b>{money(Number(p.price))}</b><button onClick={()=>add(p)} aria-label={`Add ${p.name}`}><Plus size={17}/></button></div></div></article>)}</div>;
}
function OrderCard({order}:{order:Order}) {
  return <div className="panel order-card"><div><b>Order #{order.id.slice(0,8)}</b><p>{new Date(order.created_at).toLocaleString()}</p></div><div className="order-right"><b>{money(order.total_amount)}</b><span className="status">{order.status.replaceAll("_"," ")}</span></div></div>;
}
