
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase, supabaseReady } from "./supabase";
import AdminDashboard from "./AdminDashboard";
import {
  ShoppingBag,
  Utensils,
  LogOut,
  Plus,
  Minus,
  X,
  ShieldCheck,
  ClipboardList,
  ChefHat,
  Copy,
  Check
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string | null;
  category_id?: string | null;
  is_available?: boolean;
};

type CartItem = {
  product: Product;
  quantity: number;
};

type Order = {
  id: string;
  order_status: string;
  total: number;
  created_at: string;
  payment_method?: string;
  customer_name?: string;
};

const BANK_ACCOUNTS = [
  {
    bank: "United Bank for Africa (UBA)",
    accountNumber: "2364670378",
    accountName: "Faisal Yusuf Suraj"
  },
  {
    bank: "Opay",
    accountNumber: "9112809021",
    accountName: "Faisal Yusuf Suraj"
  }
];

const money = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(n || 0);

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<"home" | "menu" | "account" | "admin">("home");
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [copiedAccount, setCopiedAccount] = useState("");
  const [auth, setAuth] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [checkout, setCheckout] = useState({
    name: "",
    phone: "",
    address: "",
    note: "",
    method: "cash_on_delivery"
  });

  const [receipt, setReceipt] = useState<File | null>(null);

  useEffect(() => {
    if (!supabaseReady) return;

    loadProducts();

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      checkAdmin();
      loadOrders();
    } else {
      setIsAdmin(false);
      setOrders([]);
    }
  }, [user]);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_available", true)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Could not load the food menu: " + error.message);
      return;
    }

    if (data) setProducts(data as Product[]);
  }

  async function checkAdmin() {
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(Boolean(data));
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_status,total,created_at,payment_method,customer_name")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Could not load orders:", error.message);
      return;
    }

    if (data) setOrders(data as Order[]);
  }

  function add(product: Product) {
    setCart(old => {
      const found = old.find(i => i.product.id === product.id);

      return found
        ? old.map(i =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        : [...old, { product, quantity: 1 }];
    });

    setMessage(product.name + " added to your bag.");
  }

  function changeQty(id: string, delta: number) {
    setCart(old =>
      old
        .map(i =>
          i.product.id === id
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter(i => i.quantity > 0)
    );
  }

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.product.price) * item.quantity,
        0
      ),
    [cart]
  );

  async function copyAccount(number: string) {
    try {
      await navigator.clipboard.writeText(number);
      setCopiedAccount(number);
      setMessage("Account number copied successfully.");

      window.setTimeout(() => {
        setCopiedAccount("");
      }, 2500);
    } catch {
      setMessage("Copy was not available. Please copy the number manually.");
    }
  }

  async function submitAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!supabaseReady) {
      setMessage("Supabase is not connected. Please try again later.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const result =
        authMode === "signup"
          ? await supabase.auth.signUp({
              email: auth.email,
              password: auth.password,
              options: {
                data: { full_name: auth.name },
                emailRedirectTo: `${window.location.origin}/`
              }
            })
          : await supabase.auth.signInWithPassword({
              email: auth.email,
              password: auth.password
            });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (authMode === "signup") {
        if (result.data.session) {
          setUser(result.data.session.user);
          setMessage("Your account has been created successfully.");
        } else {
          setMessage(
            "Account created. Please check your email and confirm your account. Then sign in to continue ordering."
          );
          setAuthMode("login");
        }
      } else {
        setUser(result.data.user);
        setMessage("Signed in successfully. You can now place your order.");
        setPage("account");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setMessage("Please create an account or sign in before placing an order.");
      setAuthMode("signup");
      setCartOpen(false);
      setPage("account");
      return;
    }

    if (!cart.length) {
      setMessage("Your bag is empty. Please add food before checkout.");
      return;
    }

    if (!checkout.name.trim() || !checkout.phone.trim() || !checkout.address.trim()) {
      setMessage("Please complete your name, phone number and delivery address.");
      return;
    }

    if (!supabaseReady) {
      setMessage("The ordering service is not connected. Please try again later.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const items = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity
      }));

      const { data, error } = await supabase.rpc(
        "create_restaurant_order",
        {
          p_customer_name: checkout.name.trim(),
          p_customer_phone: checkout.phone.trim(),
          p_delivery_address: { address: checkout.address.trim() },
          p_items: items,
          p_payment_method: checkout.method,
          p_customer_note: checkout.note.trim() || null
        }
      );

      if (error) {
        setMessage("Order could not be submitted: " + error.message);
        return;
      }

      const orderId =
        typeof data === "string"
          ? data
          : data?.order_id || data?.id;

      if (!orderId) {
        setMessage(
          "The order could not be confirmed. Your bag has been kept. Please try again."
        );
        return;
      }

      let receiptMessage = "";

      if (checkout.method === "bank_transfer" && receipt) {
        const safeName = receipt.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

        const path = `${user.id}/${orderId}/${Date.now()}-${safeName}`;

        const upload = await supabase.storage
          .from("payment-receipts")
          .upload(path, receipt, { upsert: false });

        if (upload.error) {
          receiptMessage =
            " Your order was submitted, but receipt upload failed. Please contact the restaurant to provide proof of payment.";
        } else {
          const { error: paymentError } = await supabase
            .from("payments")
            .update({ receipt_url: path })
            .eq("order_id", orderId);

          if (paymentError) {
            receiptMessage =
              " Your order was submitted, but the receipt could not be linked. Please contact the restaurant.";
          }
        }
      }

      setCart([]);
      setReceipt(null);
      await loadOrders();

      setCartOpen(false);
      setPage("account");

      setMessage(
        "Your order has been submitted successfully and is now Pending Approval. The restaurant must approve it before preparation." +
          receiptMessage
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? "Something went wrong while submitting your order: " + error.message
          : "Something went wrong while submitting your order. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from("orders")
      .update({ order_status: status })
      .eq("id", id);

    setMessage(
      error?.message || "Order status updated successfully."
    );

    await loadOrders();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setPage("home");
    setMessage("You have signed out.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={e => {
            e.preventDefault();
            setPage("home");
          }}
        >
          <span className="brand-mark">G</span>
          <span>
            THE GOLDEN
            <br />
            <b>CALABASH</b>
          </span>
        </a>

        <nav>
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("menu")}>Our Menu</button>
          <button onClick={() => setPage("account")}>My Account</button>
          {isAdmin && (
            <button onClick={() => setPage("admin")}>Admin</button>
          )}
        </nav>

        <div className="actions">
          <button
            className="icon-btn"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            <ShoppingBag size={19} />
            <span className="count">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </button>

          {user ? (
            <button
              className="icon-btn"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut size={19} />
            </button>
          ) : (
            <button
              className="gold-btn small"
              onClick={() => setPage("account")}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {!supabaseReady && (
        <div className="notice">
          Connect your Supabase project by adding the required VITE
          variables in your environment settings.
        </div>
      )}

      {message && (
        <div className="toast">
          <span>{message}</span>
          <button onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {page === "home" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">A TASTE OF NIGERIAN HERITAGE</p>
              <h1>
                Good food.
                <br />
                <em>Golden</em> moments.
              </h1>
              <p className="hero-text">
                A warm table, generous flavours and the Nigerian dishes
                you love — thoughtfully prepared and served with care.
              </p>
              <button
                className="gold-btn"
                onClick={() => setPage("menu")}
              >
                Explore our menu <span>→</span>
              </button>
              <div className="hero-note">
                <span className="dot" /> Freshly prepared · Made with care
              </div>
            </div>

            <div className="hero-art">
              <div className="plate">
                <div className="plate-inner">
                  <span>THE GOLDEN</span>
                  <b>CALABASH</b>
                  <small>AUTHENTIC FLAVOUR</small>
                </div>
              </div>
              <div className="art-caption">
                TRADITION, SERVED BEAUTIFULLY
              </div>
            </div>
          </section>

          <section className="intro">
            <p className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</p>
            <h2>
              Flavours worth
              <br />
              coming back for.
            </h2>
            <p>
              Discover comforting classics and satisfying favourites
              made for sharing.
            </p>
            <button
              className="text-link"
              onClick={() => setPage("menu")}
            >
              VIEW THE MENU ↗
            </button>
          </section>

          <MenuGrid products={products.slice(0, 3)} add={add} />
        </main>
      )}

      {page === "menu" && (
        <main className="content-page">
          <p className="eyebrow">MADE FRESH FOR YOU</p>
          <h1 className="page-title">Our Menu</h1>
          <p className="muted">
            Choose your favourites and add them to your bag.
          </p>
          <MenuGrid products={products} add={add} />
        </main>
      )}

      {page === "account" && (
        <main className="content-page narrow">
          <p className="eyebrow">YOUR GOLDEN CALABASH</p>
          <h1 className="page-title">
            {user ? "Your account" : "Welcome"}
          </h1>

          {!user ? (
            <form className="panel form" onSubmit={submitAuth}>
              <div className="tabs">
                <button
                  type="button"
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => setAuthMode("login")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === "signup" ? "active" : ""}
                  onClick={() => setAuthMode("signup")}
                >
                  Create account
                </button>
              </div>

              {authMode === "signup" && (
                <label>
                  Full name
                  <input
                    required
                    value={auth.name}
                    onChange={e =>
                      setAuth({ ...auth, name: e.target.value })
                    }
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  required
                  value={auth.email}
                  onChange={e =>
                    setAuth({ ...auth, email: e.target.value })
                  }
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  minLength={6}
                  required
                  value={auth.password}
                  onChange={e =>
                    setAuth({ ...auth, password: e.target.value })
                  }
                />
              </label>

              <button
                type="submit"
                className="gold-btn full"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          ) : (
            <>
              <div className="panel">
                <p>
                  Signed in as <b>{user.email}</b>
                </p>
                <button className="outline-btn" onClick={signOut}>
                  Sign out
                </button>
              </div>

              <h2 className="section-heading">Your recent orders</h2>

              {orders.length ? (
                orders.map(order => (
                  <OrderCard key={order.id} order={order} />
                ))
              ) : (
                <p className="muted">
                  Your orders will appear here.
                </p>
              )}
            </>
          )}
        </main>
      )}

      {page === "admin" && (
        <main className="content-page">
          <p className="eyebrow">
            <ShieldCheck size={14} /> RESTAURANT MANAGEMENT
          </p>
          <h1 className="page-title">Admin dashboard</h1>
          {!isAdmin ? (
            <p className="muted">This account does not have administrator access.</p>
          ) : (
            <AdminDashboard userId={user.id} productCount={products.length} />
          )}
        </main>
      )}

      {cartOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setCartOpen(false)}
        >
          <aside
            className="drawer"
            onClick={e => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2>Your bag</h2>
              <button
                className="icon-btn"
                onClick={() => setCartOpen(false)}
              >
                <X />
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="muted">
                Your bag is waiting for something delicious.
              </p>
            ) : (
              <>
                {cart.map(item => (
                  <div className="cart-row" key={item.product.id}>
                    <div>
                      <b>{item.product.name}</b>
                      <p>{money(Number(item.product.price))}</p>

                      <div className="qty">
                        <button
                          type="button"
                          onClick={() => changeQty(item.product.id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(item.product.id, 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    <b>
                      {money(Number(item.product.price) * item.quantity)}
                    </b>
                  </div>
                ))}

                <div className="total-row">
                  <span>Subtotal</span>
                  <b>{money(total)}</b>
                </div>

                {!user ? (
                  <div className="panel form">
                    <h3>Account required</h3>
                    <p>
                      You can browse the menu and add food to your bag,
                      but you must create an account or sign in before
                      placing an order.
                    </p>

                    <button
                      type="button"
                      className="gold-btn full"
                      onClick={() => {
                        setAuthMode("signup");
                        setCartOpen(false);
                        setPage("account");
                        setMessage("Create an account to continue with your order.");
                      }}
                    >
                      Create an account
                    </button>

                    <button
                      type="button"
                      className="outline-btn full"
                      onClick={() => {
                        setAuthMode("login");
                        setCartOpen(false);
                        setPage("account");
                        setMessage("Sign in to continue with your order.");
                      }}
                    >
                      I already have an account
                    </button>
                  </div>
                ) : (
                  <form className="form checkout" onSubmit={placeOrder}>
                    <h3>Delivery details</h3>

                    <label>
                      Full name
                      <input
                        required
                        value={checkout.name}
                        onChange={e =>
                          setCheckout({
                            ...checkout,
                            name: e.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Phone number
                      <input
                        required
                        type="tel"
                        value={checkout.phone}
                        onChange={e =>
                          setCheckout({
                            ...checkout,
                            phone: e.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Delivery address
                      <textarea
                        required
                        value={checkout.address}
                        onChange={e =>
                          setCheckout({
                            ...checkout,
                            address: e.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Order note (optional)
                      <textarea
                        value={checkout.note}
                        onChange={e =>
                          setCheckout({
                            ...checkout,
                            note: e.target.value
                          })
                        }
                      />
                    </label>

                    <label>
                      Payment method
                      <select
                        value={checkout.method}
                        onChange={e => {
                          setCheckout({
                            ...checkout,
                            method: e.target.value
                          });
                          setReceipt(null);
                        }}
                      >
                        <option value="cash_on_delivery">
                          Cash on delivery
                        </option>
                        <option value="bank_transfer">
                          Bank transfer
                        </option>
                      </select>
                    </label>

                    {checkout.method === "bank_transfer" && (
                      <div className="transfer-note">
                        <h3>Make your bank transfer</h3>
                        <p>
                          Transfer the exact order amount to either of
                          the accounts below. Your order will remain
                          pending until the restaurant confirms payment.
                        </p>

                        {BANK_ACCOUNTS.map(account => (
                          <div
                            className="panel"
                            key={account.accountNumber}
                          >
                            <b>{account.bank}</b>
                            <p>Account name: {account.accountName}</p>
                            <p>
                              Account number:{" "}
                              <strong>{account.accountNumber}</strong>
                            </p>
                            <button
                              type="button"
                              className="outline-btn"
                              onClick={() =>
                                copyAccount(account.accountNumber)
                              }
                            >
                              {copiedAccount === account.accountNumber ? (
                                <>
                                  <Check size={15} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={15} /> Copy account number
                                </>
                              )}
                            </button>
                          </div>
                        ))}

                        <p>
                          <b>Amount to transfer: {money(total)}</b>
                        </p>

                        <label>
                          Upload transfer receipt (optional)
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={e =>
                              setReceipt(e.target.files?.[0] || null)
                            }
                          />
                        </label>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="gold-btn full"
                      disabled={busy}
                    >
                      {busy
                        ? "Submitting…"
                        : `Place order · ${money(total)}`}
                    </button>

                    <small>
                      Your order must be approved by the restaurant before
                      preparation. Bank transfers must be verified by
                      the restaurant before being marked as paid.
                    </small>
                  </form>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      <footer>
        <div className="brand">
          <span className="brand-mark">G</span>
          <span>
            THE GOLDEN
            <br />
            <b>CALABASH</b>
          </span>
        </div>
        <p>Good food. Golden moments.</p>
        <small>
          © {new Date().getFullYear()} THE GOLDEN CALABASH · Nigeria
        </small>
      </footer>
    </div>
  );
}

function MenuGrid({
  products,
  add
}: {
  products: Product[];
  add: (p: Product) => void;
}) {
  if (!products.length) {
    return (
      <div className="empty panel">
        <Utensils size={28} />
        <h3>Our menu is being prepared</h3>
        <p>Menu items added by the restaurant will appear here.</p>
      </div>
    );
  }

  return (
    <div className="menu-grid">
      {products.map(product => (
        <article className="food-card" key={product.id}>
          <div className="food-image">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} />
            ) : (
              <div className="food-placeholder">
                <Utensils size={34} />
                <span>FRESHLY PREPARED</span>
              </div>
            )}
          </div>

          <div className="food-info">
            <div>
              <h3>{product.name}</h3>
              <p>
                {product.description || "Prepared fresh with care."}
              </p>
            </div>

            <div className="food-bottom">
              <b>{money(Number(product.price))}</b>
              <button
                onClick={() => add(product)}
                aria-label={`Add ${product.name}`}
              >
                <Plus size={17} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="panel order-card">
      <div>
        <b>Order #{order.id.slice(0, 8)}</b>
        <p>{new Date(order.created_at).toLocaleString()}</p>
      </div>

      <div className="order-right">
        <b>{money(Number(order.total))}</b>
        <span className="status">
          {order.order_status.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}
