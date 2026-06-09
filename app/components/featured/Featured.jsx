// /* eslint-disable @next/next/no-img-element */
// "use client";

// import Link from "next/link";
// import styles from "./Featured.module.css";
// import { siteConfig } from "@/config/site";

// const products = [
//   {
//     id: "almond",
//     name: "Almond Ragda",
//     price: "₹120",
//     badge: "new",
//     rating: 5,
//     bottle: siteConfig.assets.almondBottle,
//     href: "/pages/shop/almond-milk",
//     tone: "almond",
//   },
//   {
//     id: "blueberry",
//     name: "Blueberry Ragda",
//     price: "₹120",
//     badge: "back",
//     rating: 5,
//     bottle: siteConfig.assets.blueberryBottle,
//     href: "/pages/shop",
//     tone: "blueberry",
//   },
//   {
//     id: "pistachio",
//     name: "Pistachio Ragda",
//     price: "₹120",
//     badge: "loved",
//     rating: 5,
//     bottle: siteConfig.assets.pistachioBottle,
//     href: "/pages/shop",
//     tone: "pistachio",
//   },
// ];

// function Stars({ count }) {
//   return (
//     <span className={styles.stars} aria-label={`${count} out of 5`}>
//       {Array.from({ length: 5 }).map((_, i) => (
//         <svg
//           key={i}
//           viewBox="0 0 24 24"
//           className={styles.star}
//           fill={i < count ? "currentColor" : "none"}
//           stroke="currentColor"
//           strokeWidth="1.6"
//         >
//           <path d="M12 2.5l2.9 5.88 6.5.94-4.7 4.58 1.11 6.46L12 17.9l-5.81 3.06 1.11-6.46-4.7-4.58 6.5-.94L12 2.5z" />
//         </svg>
//       ))}
//     </span>
//   );
// }

// export default function Featured() {
//   return (
//     <section className={styles.featured}>
//       <div className={styles.panel}>
//         {/* Promo ticker */}
//         <div className={styles.ticker}>
//           <span>✦ free shipping over ₹599</span>
//           <span className={styles.tickerDot}>✦ new drop friday ✦</span>
//           <span>all whole food ◎</span>
//         </div>

//         <div className={styles.body}>
//           {/* Section label row */}
//           <div className={styles.topRow}>
//             <span className={styles.kicker}>drinks</span>
//             <Link href="/pages/shop" className={styles.shopAll}>
//               shop all →
//             </Link>
//           </div>

//           {/* Headline + note */}
//           <div className={styles.headlineRow}>
//             <h2 className={styles.headline}>
//               sip
//               <br />
//               slow
//             </h2>
//             <div className={styles.note}>
//               100% whole food
//               <br />
//               nothing synthetic
//             </div>
//           </div>

//           {/* Product cards */}
//           <div className={styles.cards}>
//             {products.map((p) => (
//               <Link
//                 key={p.id}
//                 href={p.href}
//                 className={`${styles.card} ${styles[`tone_${p.tone}`]}`}
//               >
//                 <span className={styles.badge}>{p.badge}</span>
//                 <div className={styles.bottleWrap}>
//                   <img
//                     src={p.bottle}
//                     alt={p.name}
//                     className={styles.bottle}
//                   />
//                 </div>
//                 <div className={styles.cardFoot}>
//                   <h3 className={styles.cardName}>{p.name}</h3>
//                   <div className={styles.cardMeta}>
//                     <Stars count={p.rating} />
//                     <span className={styles.price}>· {p.price}</span>
//                   </div>
//                 </div>
//               </Link>
//             ))}
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }
