// src/pages/Admin.jsx
// Super admin dashboard — full control over all shops

import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Admin.css";

const API = "http://127.0.0.1:8000";

function Admin() {
  const navigate = useNavigate();
  const [tab,     setTab]     = useState("items");   // items | offers | staff
  const [shops,   setShops]   = useState([]);
  const [items,   setItems]   = useState([]);
  const [offers,  setOffers]  = useState([]);
  const [selShop, setSelShop] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState("");

  // New item form
  const [newItem, setNewItem] = useState({
    name: "", price: "", subcategory: "", tags: "", in_stock: true
  });

  // New offer form
  const [newOffer, setNewOffer] = useState({
    place_id: "", title: "", description: "", discount_percent: ""
  });

  // New staff form
  const [newStaff, setNewStaff] = useState({
    email: "", password: "", shop_id: "", shop_name: ""
  });

  // ── Load shops on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchShops();
  }, []);

  // ── Load items when shop selected ───────────────────────────────
  useEffect(() => {
    if (selShop) {
      fetchItems(selShop);
      fetchOffers(selShop);
    }
  }, [selShop]);

  const getHeaders = async () => {
    const token = await auth.currentUser?.getIdToken();
    return {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
    };
  };

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  };

  // ── API calls ────────────────────────────────────────────────────
  const fetchShops = async () => {
    try {
      const res  = await fetch(`${API}/admin/shops`, { headers: await getHeaders() });
      const data = await res.json();
      setShops(data.shops || []);
      if (data.shops?.length > 0) setSelShop(data.shops[0].place_id);
    } catch { showMsg("Failed to load shops."); }
  };

  const fetchItems = async (shopId) => {
    try {
      const res  = await fetch(`${API}/admin/shop/${shopId}/items`, { headers: await getHeaders() });
      const data = await res.json();
      setItems(data.items || []);
    } catch { showMsg("Failed to load items."); }
  };

  const fetchOffers = async (shopId) => {
    try {
      const res  = await fetch(`${API}/admin/shop/${shopId}/offers`, { headers: await getHeaders() });
      const data = await res.json();
      setOffers(data.offers || []);
    } catch { showMsg("Failed to load offers."); }
  };

  const updateItem = async (itemId, field, value) => {
    try {
      const headers = await getHeaders();
      await fetch(`${API}/admin/item/${itemId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ [field]: value }),
      });
      fetchItems(selShop);
      showMsg("Updated successfully.");
    } catch { showMsg("Update failed."); }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const headers = await getHeaders();
      await fetch(`${API}/admin/item/${itemId}`, { method: "DELETE", headers });
      fetchItems(selShop);
      showMsg("Item deleted.");
    } catch { showMsg("Delete failed."); }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.price) {
      showMsg("Name and price are required."); return;
    }
    try {
      const headers = await getHeaders();
      await fetch(`${API}/admin/item`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...newItem, place_id: selShop, price: parseFloat(newItem.price) }),
      });
      setNewItem({ name: "", price: "", subcategory: "", tags: "", in_stock: true });
      fetchItems(selShop);
      showMsg("Item added.");
    } catch { showMsg("Failed to add item."); }
  };

  const deleteOffer = async (offerId) => {
    if (!window.confirm("Remove this offer?")) return;
    try {
      const headers = await getHeaders();
      await fetch(`${API}/admin/offer/${offerId}`, { method: "DELETE", headers });
      fetchOffers(selShop);
      showMsg("Offer removed.");
    } catch { showMsg("Failed to remove offer."); }
  };

  const addOffer = async () => {
    if (!newOffer.title || !newOffer.description) {
      showMsg("Title and description are required."); return;
    }
    try {
      const headers = await getHeaders();
      await fetch(`${API}/admin/offer`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...newOffer,
          place_id: selShop,
          discount_percent: newOffer.discount_percent ? parseFloat(newOffer.discount_percent) : null,
        }),
      });
      setNewOffer({ place_id: "", title: "", description: "", discount_percent: "" });
      fetchOffers(selShop);
      showMsg("Offer added.");
    } catch { showMsg("Failed to add offer."); }
  };

  const createStaff = async () => {
    if (!newStaff.email || !newStaff.password || !newStaff.shop_id || !newStaff.shop_name) {
      showMsg("All fields are required."); return;
    }
    if (newStaff.password.length < 8) {
      showMsg("Password must be at least 8 characters."); return;
    }
    setLoading(true);
    try {
      // Create Firebase account
      const result = await createUserWithEmailAndPassword(
        auth, newStaff.email, newStaff.password
      );
      // Store role in Firestore
      await setDoc(doc(db, "users", result.user.uid), {
        role:      "shopkeeper",
        shop_id:   newStaff.shop_id,
        shop_name: newStaff.shop_name,
        email:     newStaff.email,
      });
      setNewStaff({ email: "", password: "", shop_id: "", shop_name: "" });
      showMsg(`Shop keeper account created for ${newStaff.shop_name}.`);
    } catch (err) {
      showMsg(err.code === "auth/email-already-in-use"
        ? "This email is already registered."
        : "Failed to create account.");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/staff/login");
  };

  const selectedShopName = shops.find(s => s.place_id === selShop)?.name || "";

  return (
    <div className="admin-root">

      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <span className="admin-logo">🏬</span>
          <div>
            <div className="admin-title">Admin Panel</div>
            <div className="admin-sub">Super Admin</div>
          </div>
        </div>
        <button className="admin-logout" onClick={handleLogout}>Logout</button>
      </div>

      {/* Toast */}
      {msg && <div className="admin-toast">{msg}</div>}

      {/* Shop selector */}
      <div className="admin-shop-bar">
        <label>Shop:</label>
        <select value={selShop} onChange={e => setSelShop(e.target.value)}>
          {shops.map(s => (
            <option key={s.place_id} value={s.place_id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {["items","offers","staff"].map(t => (
          <button key={t}
            className={`admin-tab${tab===t?" admin-tab--active":""}`}
            onClick={() => setTab(t)}>
            {t === "items"  ? "📦 Items"  :
             t === "offers" ? "🏷 Offers" : "👤 Staff"}
          </button>
        ))}
      </div>

      <div className="admin-body">

        {/* ── ITEMS TAB ── */}
        {tab === "items" && (
          <div>
            <div className="admin-section-title">
              Items in {selectedShopName}
            </div>

            {/* Items table */}
            <div className="admin-table-wrap">
              {items.length === 0 ? (
                <p className="admin-empty">No items found.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Price (₹)</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>
                          <input
                            className="admin-price-input"
                            type="number"
                            defaultValue={item.price}
                            onBlur={e => updateItem(item.id, "price", parseFloat(e.target.value))}
                          />
                        </td>
                        <td>
                          <button
                            className={`admin-stock-btn${item.in_stock?" admin-stock-btn--in":""}`}
                            onClick={() => updateItem(item.id, "in_stock", !item.in_stock)}>
                            {item.in_stock ? "In Stock" : "Out of Stock"}
                          </button>
                        </td>
                        <td>
                          <button className="admin-del-btn"
                            onClick={() => deleteItem(item.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add item form */}
            <div className="admin-form-card">
              <div className="admin-form-title">Add New Item</div>
              <input placeholder="Item name *" value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <input placeholder="Price *" type="number" value={newItem.price}
                onChange={e => setNewItem({...newItem, price: e.target.value})} />
              <input placeholder="Subcategory" value={newItem.subcategory}
                onChange={e => setNewItem({...newItem, subcategory: e.target.value})} />
              <input placeholder="Tags (comma separated)" value={newItem.tags}
                onChange={e => setNewItem({...newItem, tags: e.target.value})} />
              <label className="admin-check-label">
                <input type="checkbox" checked={newItem.in_stock}
                  onChange={e => setNewItem({...newItem, in_stock: e.target.checked})} />
                In Stock
              </label>
              <button className="admin-add-btn" onClick={addItem}>Add Item</button>
            </div>
          </div>
        )}

        {/* ── OFFERS TAB ── */}
        {tab === "offers" && (
          <div>
            <div className="admin-section-title">
              Offers for {selectedShopName}
            </div>

            {offers.length === 0 ? (
              <p className="admin-empty">No active offers.</p>
            ) : (
              <div className="admin-offer-list">
                {offers.map(offer => (
                  <div key={offer.id} className="admin-offer-card">
                    <div className="admin-offer-title">{offer.title}</div>
                    <div className="admin-offer-desc">{offer.description}</div>
                    {offer.discount_percent && (
                      <div className="admin-offer-disc">{offer.discount_percent}% OFF</div>
                    )}
                    <button className="admin-del-btn"
                      onClick={() => deleteOffer(offer.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add offer form */}
            <div className="admin-form-card">
              <div className="admin-form-title">Add New Offer</div>
              <input placeholder="Title *" value={newOffer.title}
                onChange={e => setNewOffer({...newOffer, title: e.target.value})} />
              <input placeholder="Description *" value={newOffer.description}
                onChange={e => setNewOffer({...newOffer, description: e.target.value})} />
              <input placeholder="Discount % (optional)" type="number"
                value={newOffer.discount_percent}
                onChange={e => setNewOffer({...newOffer, discount_percent: e.target.value})} />
              <button className="admin-add-btn" onClick={addOffer}>Add Offer</button>
            </div>
          </div>
        )}

        {/* ── STAFF TAB ── */}
        {tab === "staff" && (
          <div>
            <div className="admin-section-title">Create Shop Keeper Account</div>
            <div className="admin-form-card">
              <input placeholder="Email *" type="email" value={newStaff.email}
                onChange={e => setNewStaff({...newStaff, email: e.target.value})} />
              <input placeholder="Password * (min 8 chars)" type="password"
                value={newStaff.password}
                onChange={e => setNewStaff({...newStaff, password: e.target.value})} />
              <select value={newStaff.shop_id}
                onChange={e => {
                  const shop = shops.find(s => s.place_id === e.target.value);
                  setNewStaff({...newStaff, shop_id: e.target.value, shop_name: shop?.name || ""});
                }}>
                <option value="">Select shop *</option>
                {shops.map(s => (
                  <option key={s.place_id} value={s.place_id}>{s.name}</option>
                ))}
              </select>
              <button className="admin-add-btn" onClick={createStaff} disabled={loading}>
                {loading ? "Creating…" : "Create Account"}
              </button>
              <p className="admin-staff-note">
                Share the email and password with the shop keeper securely.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;