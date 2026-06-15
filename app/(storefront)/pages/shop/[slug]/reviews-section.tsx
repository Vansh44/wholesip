"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { useAuth } from "@/app/(storefront)/components/auth/AuthProvider";
import { submitReview, deleteReview } from "@/app/actions/review-actions";

export interface ProductReview {
  id: string;
  customer_id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Read-only star row for whole-number ratings (individual reviews).
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="pdp-stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= value ? "pdp-star filled" : "pdp-star"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

// Lucide "star" path, drawn per-slot so each star can be filled by an exact
// fraction via a gradient — pixel-perfect (no overlapping layers to misalign).
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

// Fractional star display for averages (e.g. 3.5 → three-and-a-half stars).
export function RatingStars({
  value,
  size = 16,
}: {
  value: number;
  size?: number;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <span
      className="pdp-stars"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i)) * 100;
        const gid = `star-${uid}-${i}`;
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="pdp-star-svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gid}>
                <stop offset={`${fill}%`} stopColor="#f5a623" />
                <stop offset={`${fill}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d={STAR_PATH}
              fill={`url(#${gid})`}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

export default function ReviewsSection({
  productId,
  productSlug,
  reviews,
}: {
  productId: string;
  productSlug: string;
  reviews: ProductReview[];
}) {
  const router = useRouter();
  const { customer, loading, openAuthModal } = useAuth();
  const [isPending, startTransition] = useTransition();

  const myReview = customer
    ? reviews.find((r) => r.customer_id === customer.id)
    : undefined;

  const [rating, setRating] = useState(myReview?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(myReview?.comment ?? "");

  const count = reviews.length;
  const average =
    count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;

  const handleSubmit = () => {
    if (rating < 1) {
      toast.error("Please choose a star rating.");
      return;
    }
    startTransition(async () => {
      const result = await submitReview({
        product_id: productId,
        slug: productSlug,
        rating,
        comment,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(myReview ? "Review updated" : "Thanks for your review!");
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!myReview) return;
    startTransition(async () => {
      const result = await deleteReview(myReview.id, productSlug);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Review removed");
        setRating(0);
        setComment("");
        router.refresh();
      }
    });
  };

  const otherReviews = myReview
    ? reviews.filter((r) => r.id !== myReview.id)
    : reviews;

  return (
    <section className="pdp-reviews" id="reviews">
      <div className="pdp-reviews-head">
        <h2>Reviews</h2>
        {count > 0 && (
          <div className="pdp-reviews-summary">
            <RatingStars value={average} size={18} />
            <span className="pdp-reviews-avg">{average.toFixed(1)}</span>
            <span className="pdp-reviews-count">
              ({count} {count === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}
      </div>

      {/* Write / edit a review */}
      {loading ? null : customer ? (
        <div className="pdp-review-form">
          <span className="pdp-review-form-title">
            {myReview ? "Edit your review" : "Write a review"}
          </span>
          <div
            className="pdp-star-picker"
            onMouseLeave={() => setHover(0)}
            role="radiogroup"
            aria-label="Your rating"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="pdp-star-btn"
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                aria-checked={rating === n}
                role="radio"
              >
                <Star
                  size={26}
                  strokeWidth={1.5}
                  className={
                    n <= (hover || rating) ? "pdp-star filled" : "pdp-star"
                  }
                />
              </button>
            ))}
          </div>
          <textarea
            className="pdp-review-textarea"
            placeholder="Share what you thought about this product…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
          />
          <div className="pdp-review-actions">
            <button
              className="pdp-btn pdp-btn-buy pdp-review-submit"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending
                ? "Saving…"
                : myReview
                  ? "Update review"
                  : "Post review"}
            </button>
            {myReview && (
              <button
                className="pdp-review-delete"
                onClick={handleDelete}
                disabled={isPending}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pdp-review-signin">
          <p>Sign in to share your review of this product.</p>
          <button
            className="pdp-btn pdp-btn-cart"
            onClick={() => openAuthModal()}
          >
            Sign in to write a review
          </button>
        </div>
      )}

      {/* Existing reviews */}
      <div className="pdp-review-list">
        {count === 0 ? (
          <p className="pdp-reviews-empty">
            No reviews yet — be the first to review this product.
          </p>
        ) : (
          <>
            {myReview && <ReviewCard review={myReview} isMine />}
            {otherReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function ReviewCard({
  review,
  isMine = false,
}: {
  review: ProductReview;
  isMine?: boolean;
}) {
  return (
    <article className="pdp-review-card">
      <div className="pdp-review-card-head">
        <span className="pdp-review-author">
          {review.author_name || "Anonymous"}
          {isMine && <span className="pdp-review-you">You</span>}
        </span>
        <span className="pdp-review-date">{formatDate(review.created_at)}</span>
      </div>
      <Stars value={review.rating} />
      {review.comment && <p className="pdp-review-comment">{review.comment}</p>}
    </article>
  );
}
