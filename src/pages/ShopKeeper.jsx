// src/pages/ShopKeeper.jsx
// Shop keeper dashboard — sees and edits ONLY their own shop

import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate, useParams } from "react-router-dom";
import "./Admin.css";  // reuse same CSS

const API = "http://127.0.0.1:8000";

function ShopKeeper() {
  const { shopId } = useParams();
  const navigate   = useNavigate();
  const [tab,      setTab]      = useState("items");
  const [shopName, setShopName] = useState("");
  const [items,    setItems]    = useState([]);
  const [offers,   setOffers]   = useState([]);
  const [msg,      setMsg]      = useState("");

  const [newItem, setNewItem] = useState({
    name: "", price: "", subcategory: "", tags: "", in_stock: true
  });
  const [newOffer, setNewOffer] = useState({
    title: "", description: "", discount_percent: ""
  });

  useEffect(() => {
    loadShopInfo();
    fetchItems();
    fetchOffers();
  }, [shopId]);

  const loadShopInfo = async () => {
    try {
      const uid     = auth.currentUser?.uid;
      const userDoc = await getDoc(doc(db, "users", uid));
      setShopName(userDoc.data()?.shop_name || shopId);
    } catch {}
  };

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

  const fetchItems = async () => {
    try {
      const res  = await fetch(`${API}/admin/shop/${shopId}/items`, { headers: await getHeaders() });
      const data = await res.json();
      setItems(data.items || []);
    } catch { showMsg("Failed to load items."); }
  };

  const fetchOffers = async () => {
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
      fetchItems();
      showMsg("Updated.");
    } catch { showMsg("Update failed."); }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await fetch(`${API}/admin/item/${itemId}`, {
        method: "DELETE",
        headers: await getHeaders(),
      });
      fetchItems();
      showMsg("Item deleted.");
    } catch { showMsg("Delete failed."); }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.price) {
      showMsg("Name and price are required."); return;
    }
    try {
      await fetch(`${API}/admin/item`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({ ...newItem, place_id: shopId, price: parseFloat(newItem.price) }),
      });
      setNewItem({ name: "", price: "", subcategory: "", tags: "", in_stock: true });
      fetchItems();
      showMsg("Item added.");
    } catch { showMsg("Failed to add item."); }
  };

  const deleteOffer = async (offerId) => {
    if (!window.confirm("Remove this offer?")) return;
    try {
      await fetch(`${API}/admin/offer/${offerId}`, {
        method: "DELETE",
        headers: await getHeaders(),
      });
      fetchOffers();
      showMsg("Offer removed.");
    } catch { showMsg("Failed."); }
  };

  const addOffer = async () => {
    if (!newOffer.title || !newOffer.description) {
      showMsg("Title and description are required."); return;
    }
    try {
      await fetch(`${API}/admin/offer`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({
          ...newOffer,
          place_id: shopId,
          discount_percent: newOffer.discount_percent ? parseFloat(newOffer.discount_percent) : null,
        }),
      });
      setNewOffer({ title: "", description: "", discount_percent: "" });
      fetchOffers();
      showMsg("Offer added.");
    } catch { showMsg("Failed to add offer."); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/staff/login");
  };

  return (
    <div className="admin-root">

      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <span className="admin-logo">🏪</span>
          <div>
            <div className="admin-title">{shopName}</div>
            <div className="admin-sub">Shop Keeper</div>
          </div>
        </div>
        <button className="admin-logout" onClick={handleLogout}>Logout</button>
      </div>

      {msg && <div className="admin-toast">{msg}</div>}

      {/* Tabs — no Staff tab for shop keepers */}
      <div className="admin-tabs">
        {["items","offers"].map(t => (
          <button key={t}
            className={`admin-tab${tab===t?" admin-tab--active":""}`}
            onClick={() => setTab(t)}>
            {t === "items" ? "📦 Items" : "🏷 Offers"}
          </button>
        ))}
      </div>

      <div className="admin-body">

        {/* ITEMS TAB */}
        {tab === "items" && (
          <div>
            <div className="admin-section-title">Your Items</div>
            <div className="admin-table-wrap">
              {items.length === 0 ? (
                <p className="admin-empty">No items yet.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Price (₹)</th>
                      <th>Stock</th>
                      <th></th>
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
                            {item.in_stock ? "In Stock" : "Out"}
                          </button>
                        </td>
                        <td>
                          <button className="admin-del-btn" onClick={() => deleteItem(item.id)}>
                            Del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-form-card">
              <div className="admin-form-title">Add Item</div>
              <input placeholder="Name *" value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <input placeholder="Price *" type="number" value={newItem.price}
                onChange={e => setNewItem({...newItem, price: e.target.value})} />
              <input placeholder="Subcategory" value={newItem.subcategory}
                onChange={e => setNewItem({...newItem, subcategory: e.target.value})} />
              <label className="admin-check-label">
                <input type="checkbox" checked={newItem.in_stock}
                  onChange={e => setNewItem({...newItem, in_stock: e.target.checked})} />
                In Stock
              </label>
              <button className="admin-add-btn" onClick={addItem}>Add Item</button>
            </div>
          </div>
        )}

        {/* OFFERS TAB */}
        {tab === "offers" && (
          <div>
            <div className="admin-section-title">Your Offers</div>
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
                    <button className="admin-del-btn" onClick={() => deleteOffer(offer.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="admin-form-card">
              <div className="admin-form-title">Add Offer</div>
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
      </div>
    </div>
  );
}

export default ShopKeeper;