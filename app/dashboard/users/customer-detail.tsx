"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Copy, Mail, Phone, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteCustomer, updateCustomer } from "@/app/actions/customer-actions";
import {
  formatDate,
  formatDateTime,
  type CustomerDetail as CustomerDetailType,
} from "./shared";

export function CustomerDetail({
  customer,
  canManage,
}: {
  customer: CustomerDetailType;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [firstName, setFirstName] = useState(customer.first_name ?? "");
  const [lastName, setLastName] = useState(customer.last_name ?? "");
  const [email, setEmail] = useState(customer.email ?? "");

  const mailto = customer.email ? `mailto:${customer.email}` : null;

  const save = () =>
    startTransition(async () => {
      const result = await updateCustomer(customer.id, {
        firstName,
        lastName,
        email,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer updated");
      setEditing(false);
      router.refresh();
    });

  const doDelete = () =>
    startTransition(async () => {
      const result = await deleteCustomer(customer.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer deleted");
      router.push("/dashboard/users");
      router.refresh();
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/users/${customer.id}`,
      );
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="customer-detail">
      <div className="customer-detail-grid">
        <div className="customer-detail-main">
          {editing ? (
            <div className="customers-form">
              <label>
                <span>First name</span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="customer-detail-danger-row">
                <Button size="sm" onClick={save} disabled={isPending}>
                  {isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="customer-detail-fields">
              {mailto ? (
                <a href={mailto} className="customer-detail-field">
                  <Mail className="h-4 w-4" />
                  <span>
                    <small>Email</small>
                    {customer.email}
                  </span>
                </a>
              ) : (
                <div className="customer-detail-field">
                  <Mail className="h-4 w-4" />
                  <span>
                    <small>Email</small>
                    <em>None on file</em>
                  </span>
                </div>
              )}
              <div className="customer-detail-field">
                <Phone className="h-4 w-4" />
                <span>
                  <small>Phone</small>
                  <code>{customer.phone}</code>
                </span>
              </div>
              <div className="customer-detail-field">
                <CalendarDays className="h-4 w-4" />
                <span>
                  <small>Joined</small>
                  {formatDateTime(customer.created_at)}
                </span>
              </div>
              <div className="customer-detail-field">
                <Star className="h-4 w-4" />
                <span>
                  <small>Activity</small>
                  {customer.review_count} review
                  {customer.review_count === 1 ? "" : "s"} ·{" "}
                  {customer.blog_count} blog
                  {customer.blog_count === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          )}

          <div className="customer-detail-section">
            <span className="customer-detail-label">
              Reviews ({customer.reviews.length})
            </span>
            {customer.reviews.length === 0 ? (
              <p className="customer-detail-muted">No reviews yet.</p>
            ) : (
              <ul className="customer-detail-list">
                {customer.reviews.map((review) => (
                  <li key={review.id}>
                    <div className="customer-detail-list-head">
                      <strong>{review.product_name ?? "Product"}</strong>
                      <span className="customer-detail-stars">
                        {"★".repeat(review.rating)}
                        {"☆".repeat(5 - review.rating)}
                      </span>
                    </div>
                    {review.comment && <p>{review.comment}</p>}
                    <small>{formatDate(review.created_at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="customer-detail-section">
            <span className="customer-detail-label">
              Blog submissions ({customer.blogs.length})
            </span>
            {customer.blogs.length === 0 ? (
              <p className="customer-detail-muted">No submissions yet.</p>
            ) : (
              <ul className="customer-detail-list">
                {customer.blogs.map((blog) => (
                  <li key={blog.id}>
                    <div className="customer-detail-list-head">
                      <Link
                        href={`/dashboard/blogs`}
                        className="customer-detail-link"
                      >
                        {blog.title}
                      </Link>
                      <span className="dash-badge dash-badge-grey">
                        {blog.status}
                      </span>
                    </div>
                    <small>{formatDate(blog.created_at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="customer-detail-actions">
          <div>
            <span className="customer-detail-label">Actions</span>
            <div className="customer-detail-action-list">
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="justify-start"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
              {mailto && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(mailto, "_blank")}
                  className="justify-start"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email customer
                </Button>
              )}
              {canManage && !editing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="justify-start"
                >
                  Edit details
                </Button>
              )}
            </div>
          </div>

          {canManage && (
            <div className="customer-detail-danger">
              {confirmDelete ? (
                <>
                  <span>Delete this customer?</span>
                  <div className="customer-detail-danger-row">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={doDelete}
                    >
                      {isPending ? "Deleting..." : "Confirm"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="justify-start"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete customer
                </Button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
