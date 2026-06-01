"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabaseClient";
import styles from "./Admin.module.css";

export default function AdminPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("member"); // default to member

  // Catalog State
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  // Form Tabs State
  const [activeFormTab, setActiveFormTab] = useState("product");

  // Status Alerts
  const [formSuccess, setFormSuccess] = useState("");
  const [formError, setFormError] = useState("");

  // Product Form State
  const [pName, setPName] = useState("");
  const [pSlug, setPSlug] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pCategoryId, setPCategoryId] = useState("");
  const [pImgUrl, setPImgUrl] = useState("");
  const [pSku, setPSku] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pComparePrice, setPComparePrice] = useState("");
  const [pStock, setPStock] = useState("");
  const [pSize, setPSize] = useState("250g");
  // Dietary Attributes Checkboxes
  const [isVegan, setIsVegan] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isSugarFree, setIsSugarFree] = useState(false);

  // Category Form State
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [catDesc, setCatDesc] = useState("");

  // Check Auth & Profile role
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/dashboard/login");
        return;
      }

      // Fetch profile parameters
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, must_change_password")
        .eq("id", session.user.id)
        .single();

      if (error || !profile) {
        // Fallback: Default to member if profile has not populated yet
        setUser(session.user);
        setUserRole("member");
        setAuthLoading(false);
        fetchCatalog();
        return;
      }

      // Redirect gate: force password change
      if (profile.must_change_password) {
        router.push("/dashboard/reset-password");
        return;
      }

      setUser(session.user);
      setUserRole(profile.role);
      setAuthLoading(false);
      fetchCatalog();
    };

    checkUser();
  }, [router]);

  // Generate Slug dynamically
  const generateSlug = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setPName(val);
    setPSlug(generateSlug(val));
    setPSku(val.toUpperCase().replace(/\s+/g, "").substring(0, 5) + "-" + Math.floor(100 + Math.random() * 900));
  };

  const handleCatNameChange = (e) => {
    const val = e.target.value;
    setCatName(val);
    setCatSlug(generateSlug(val));
  };

  // Fetch Catalog data from Supabase
  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    setDbError(null);
    try {
      const { data: cats, error: catError } = await supabase
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (catError) throw catError;
      setCategories(cats || []);

      const { data: prods, error: prodError } = await supabase
        .from("products")
        .select(`
          *,
          categories (
            name
          ),
          product_variants (
            sku,
            price,
            stock,
            options
          )
        `)
        .order("created_at", { ascending: false });

      if (prodError) throw prodError;
      setProducts(prods || []);
    } catch (err) {
      console.error("Supabase Error: ", err);
      setDbError("Unable to fetch catalog. Please verify your Supabase SQL tables exist and keys are configured.");
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/dashboard/login");
  };

  // Handle Product Submission
  const handleAddProduct = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!pCategoryId) {
      setFormError("Please select a category.");
      return;
    }

    try {
      const attributes = { dietary: [] };
      if (isVegan) attributes.dietary.push("Vegan");
      if (isGlutenFree) attributes.dietary.push("Gluten-Free");
      if (isSugarFree) attributes.dietary.push("Sugar-Free");

      // 1. Insert Product
      const { data: newProduct, error: prodError } = await supabase
        .from("products")
        .insert([
          {
            name: pName,
            slug: pSlug,
            description: pDesc,
            category_id: pCategoryId,
            image_url: pImgUrl || "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&q=80&w=400",
            attributes: attributes,
            is_active: true,
          },
        ])
        .select()
        .single();

      if (prodError) throw prodError;

      // 2. Insert Product Variant
      const { error: variantError } = await supabase
        .from("product_variants")
        .insert([
          {
            product_id: newProduct.id,
            sku: pSku,
            price: parseFloat(pPrice),
            compare_at_price: pComparePrice ? parseFloat(pComparePrice) : null,
            stock: parseInt(pStock) || 0,
            options: { size: pSize },
          },
        ]);

      if (variantError) throw variantError;

      setFormSuccess(`Successfully added product: "${pName}"!`);
      // Reset form
      setPName("");
      setPSlug("");
      setPDesc("");
      setPImgUrl("");
      setPSku("");
      setPPrice("");
      setPComparePrice("");
      setPStock("");
      setIsVegan(false);
      setIsGlutenFree(false);
      setIsSugarFree(false);
      
      fetchCatalog();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to create product.");
    }
  };

  // Handle Category Submission
  const handleAddCategory = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    try {
      const { error: catError } = await supabase
        .from("categories")
        .insert([
          {
            name: catName,
            slug: catSlug,
            description: catDesc,
          },
        ]);

      if (catError) throw catError;

      setFormSuccess(`Successfully created category: "${catName}"!`);
      setCatName("");
      setCatSlug("");
      setCatDesc("");

      fetchCatalog();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to create category.");
    }
  };

  // Delete Product (Forbidden for Members)
  const handleDeleteProduct = async (id, name) => {
    if (userRole !== "superadmin") {
      alert("Unauthorized. Deletion operations require Superadmin role privileges.");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    setFormError("");
    setFormSuccess("");

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setFormSuccess(`Product "${name}" has been deleted.`);
      fetchCatalog();
    } catch (err) {
      console.error(err);
      setFormError("Failed to delete product.");
    }
  };

  // Filter & Search Logic
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_variants?.[0]?.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory =
      selectedCategoryFilter === "all" || product.category_id === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  if (authLoading) {
    return (
      <main className={styles.adminContainer}>
        <div className={styles.loadingSpinner}>Authenticating dashboard session...</div>
      </main>
    );
  }

  const totalProducts = products.length;
  const outOfStockCount = products.filter(p => (p.product_variants?.[0]?.stock || 0) === 0).length;
  const totalCategories = categories.length;

  return (
    <main className={styles.adminContainer}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Catalog Dashboard</h1>
          <p style={{ color: "#707070" }}>
            Logged in as: {user?.email} <span style={{ fontWeight: 700 }}>({userRole.toUpperCase()})</span>
          </p>
        </div>
        <div className={styles.headerNav}>
          {userRole === "superadmin" && (
            <Link href="/dashboard/users" className={styles.navLink}>
              User Directory
            </Link>
          )}
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Stats Board */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Products</div>
          <div className={styles.statValue}>{totalProducts}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Categories</div>
          <div className={styles.statValue}>{totalCategories}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Out of Stock Items</div>
          <div className={styles.statValue} style={{ color: outOfStockCount > 0 ? "#c62828" : "#2e7d32" }}>
            {outOfStockCount}
          </div>
        </div>
      </section>

      {dbError && (
        <div className={`${styles.alert} ${styles.errorAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <strong>Database Notice:</strong> {dbError}
        </div>
      )}

      {formSuccess && (
        <div className={`${styles.alert} ${styles.successAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {formSuccess}
        </div>
      )}

      {formError && (
        <div className={`${styles.alert} ${styles.errorAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {formError}
        </div>
      )}

      <div className={styles.workspaceGrid}>
        {/* Product Directory */}
        <section className={styles.panelCard}>
          <h2 className={styles.panelTitle}>Product Directory</h2>
          
          <div className={styles.controlsRow}>
            <div className={styles.searchBar}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search products, SKUs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className={styles.filterSelect}
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {loadingCatalog ? (
            <div className={styles.loadingSpinner}>Updating directory...</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Product Details</th>
                    <th className={styles.th}>SKU</th>
                    <th className={styles.th}>Category</th>
                    <th className={styles.th}>Price</th>
                    <th className={styles.th}>Stock</th>
                    <th className={styles.th} style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="6" className={styles.td} style={{ textAlign: "center", color: "#707070" }}>
                        No products found matching filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => {
                      const variant = product.product_variants?.[0];
                      const price = variant?.price ? `₹${variant.price}` : "N/A";
                      const stock = variant?.stock ?? 0;
                      const sizeLabel = variant?.options?.size ? ` (${variant.options.size})` : "";
                      const isMember = userRole !== "superadmin";

                      return (
                        <tr key={product.id}>
                          <td className={styles.td}>
                            <div className={styles.productNameCell}>
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className={styles.productThumb}
                              />
                              <div>
                                <div className={styles.productName}>
                                  {product.name}
                                  <span style={{ fontWeight: 400, color: "#707070", fontSize: "0.85rem" }}>
                                    {sizeLabel}
                                  </span>
                                </div>
                                <div className={styles.productSlug}>/{product.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td className={styles.td} style={{ fontFamily: "monospace", fontWeight: 700 }}>
                            {variant?.sku || "N/A"}
                          </td>
                          <td className={styles.td}>{product.categories?.name || "Uncategorized"}</td>
                          <td className={`${styles.td} ${styles.price}`}>{price}</td>
                          <td className={styles.td}>
                            <span
                              className={`${styles.stockBadge} ${
                                stock > 0 ? styles.inStock : styles.outOfStock
                              }`}
                            >
                              {stock > 0 ? `${stock} in stock` : "Out of stock"}
                            </span>
                          </td>
                          <td className={styles.td} style={{ textAlign: "right" }}>
                            <button
                              onClick={() => handleDeleteProduct(product.id, product.name)}
                              className={styles.deleteBtn}
                              disabled={isMember}
                              title={isMember ? "Deletion requires Superadmin role privileges" : "Delete Product"}
                              style={{ opacity: isMember ? 0.35 : 1 }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Creator Dashboard Forms */}
        <section className={styles.panelCard}>
          <div className={styles.formTabs}>
            <button
              onClick={() => setActiveFormTab("product")}
              className={`${styles.tabBtn} ${activeFormTab === "product" ? styles.activeTab : ""}`}
            >
              Add Product
            </button>
            <button
              onClick={() => setActiveFormTab("category")}
              className={`${styles.tabBtn} ${activeFormTab === "category" ? styles.activeTab : ""}`}
            >
              Add Category
            </button>
          </div>

          {activeFormTab === "product" ? (
            <form onSubmit={handleAddProduct} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Product Name</label>
                <input
                  type="text"
                  required
                  className={styles.input}
                  placeholder="E.g., Sweet N Sour Ragda"
                  value={pName}
                  onChange={handleNameChange}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Slug Path (auto-generated)</label>
                  <input
                    type="text"
                    required
                    className={styles.input}
                    placeholder="sweet-n-sour-ragda"
                    value={pSlug}
                    onChange={(e) => setPSlug(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Category</label>
                  <select
                    className={styles.select}
                    value={pCategoryId}
                    onChange={(e) => setPCategoryId(e.target.value)}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Product Description</label>
                <textarea
                  required
                  className={styles.textarea}
                  placeholder="Write details about taste, ingredients, cooking process..."
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Price (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className={styles.input}
                    placeholder="250.00"
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Original Price (Compare-at)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.input}
                    placeholder="299.00"
                    value={pComparePrice}
                    onChange={(e) => setPComparePrice(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>SKU Code</label>
                  <input
                    type="text"
                    required
                    className={styles.input}
                    placeholder="RAG-SWEET-250G"
                    value={pSku}
                    onChange={(e) => setPSku(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Initial Stock</label>
                  <input
                    type="number"
                    required
                    className={styles.input}
                    placeholder="100"
                    value={pStock}
                    onChange={(e) => setPStock(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Image URL</label>
                  <input
                    type="url"
                    className={styles.input}
                    placeholder="https://images.unsplash.com/..."
                    value={pImgUrl}
                    onChange={(e) => setPImgUrl(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Size/Pack Variant</label>
                  <select
                    className={styles.select}
                    value={pSize}
                    onChange={(e) => setPSize(e.target.value)}
                  >
                    <option value="250g">250g Standard Pack</option>
                    <option value="500g">500g Value Pack</option>
                    <option value="1kg">1kg Jumbo Pack</option>
                    <option value="Combo Pack">Combo Pack</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Product Attributes</label>
                <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={isVegan} onChange={(e) => setIsVegan(e.target.checked)} />
                    Vegan
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={isGlutenFree} onChange={(e) => setIsGlutenFree(e.target.checked)} />
                    Gluten-Free
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={isSugarFree} onChange={(e) => setIsSugarFree(e.target.checked)} />
                    Sugar-Free
                  </label>
                </div>
              </div>

              <button type="submit" className={styles.submitBtn}>
                Add Product to Catalog
              </button>
            </form>
          ) : (
            <form onSubmit={handleAddCategory} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Category Name</label>
                <input
                  type="text"
                  required
                  className={styles.input}
                  placeholder="E.g., Sweet Spreads"
                  value={catName}
                  onChange={handleCatNameChange}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Slug (auto-generated)</label>
                <input
                  type="text"
                  required
                  className={styles.input}
                  placeholder="sweet-spreads"
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Category Description</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Write a brief overview of products under this category..."
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                />
              </div>

              <button type="submit" className={styles.submitBtn}>
                Create Category
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
