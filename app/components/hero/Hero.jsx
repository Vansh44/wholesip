"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./Hero.module.css";

export default function Hero() {
  const slides = [
    {
      id: "almonds",
      name: "Almond Ragda",
      bgText: "ALMONDS",
      bgColor: "#E09771",
      bottleAsset: "/bottle_almond.png",
      singleAsset: "/singleAlmond.png",
      clusterAsset: "/almonds.png",
    },
    {
      id: "blueberries",
      name: "Blueberry Ragda",
      bgText: "BERRIES",
      bgColor: "#8EA6DB",
      bottleAsset: "/bottle_blueberry.png",
      singleAsset: "/singleBlueberry.png",
      clusterAsset: "/blueberries.png",
    },
    {
      id: "pistachios",
      name: "Pistachio Ragda",
      bgText: "PISTACHIOS",
      bgColor: "#88C096",
      bottleAsset: "/bottle_pistachio.png",
      singleAsset: "/singlePistachio.png",
      clusterAsset: "/pistachios.png",
    },
  ];

  const almonds = [
    {
      id: 10,
      left: "85.3%",
      top: "73.1%",
      rotate: "-8.84deg",
      type: "single",
      delay: "0.9s",
      duration: "5.6s",
    },
    {
      id: 12,
      left: "20.7%",
      top: "45.4%",
      rotate: "-6.28deg",
      type: "single",
      delay: "0.8s",
      duration: "6.0s",
    },
    {
      id: 7,
      left: "6.2%",
      top: "77.4%",
      rotate: "-6.28deg",
      type: "single",
      delay: "1.7s",
      duration: "5.9s",
    },
    {
      id: 4,
      left: "24.3%",
      top: "13.1%",
      rotate: "-6.28deg",
      type: "cluster",
      delay: "0.0s",
      duration: "7.0s",
    },
    {
      id: 11,
      left: "64.6%",
      top: "38.7%",
      rotate: "-8.84deg",
      type: "single",
      delay: "0.5s",
      duration: "5.4s",
    },
    {
      id: 9,
      left: "62.5%",
      top: "75.5%",
      rotate: "-52.08deg",
      type: "cluster",
      delay: "2.6s",
      duration: "6.3s",
    },
    {
      id: 6,
      left: "-0.8%",
      top: "46.7%",
      rotate: "-29.59deg",
      type: "cluster",
      delay: "1.5s",
      duration: "6.8s",
    },
    {
      id: 8,
      left: "24.7%",
      top: "76.9%",
      rotate: "-14.23deg",
      type: "cluster",
      delay: "0.4s",
      duration: "7.2s",
    },
    {
      id: 5,
      left: "5.1%",
      top: "11.0%",
      rotate: "-52.13deg",
      type: "single",
      delay: "0.2s",
      duration: "6.2s",
    },
    {
      id: 3,
      left: "66.3%",
      top: "8.2%",
      rotate: "-54.69deg",
      type: "cluster",
      delay: "1.1s",
      duration: "6.5s",
    },
    {
      id: 2,
      left: "87.0%",
      top: "15.3%",
      rotate: "-54.69deg",
      type: "single",
      delay: "2.3s",
      duration: "5.8s",
    },
    {
      id: 1,
      left: "83.7%",
      top: "40.8%",
      rotate: "-14.23deg",
      type: "single",
      delay: "2.0s",
      duration: "6.6s",
    },
  ];

  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const autoplayRef = useRef(null);

  const nextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  useEffect(() => {
    if (!isHovered) {
      autoplayRef.current = setInterval(nextSlide, 5000);
    }
    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current);
      }
    };
  }, [isHovered]);

  const currentSlide = slides[activeSlide];

  return (
    <section
      className={styles.heroArea}
      style={{ backgroundColor: currentSlide.bgColor }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background Stencil Text Transitions */}
      <div className={styles.backgroundTextContainer}>
        {slides.map((slide, index) => (
          <h1
            key={slide.id}
            className={`${styles.backgroundText} ${index === activeSlide ? styles.activeText : ""}`}
          >
            {slide.bgText}
          </h1>
        ))}
      </div>

      {/* Floating Ingredients per slide (to allow cross-fade transitions) */}
      {slides.map((slide, slideIndex) => {
        const isActive = slideIndex === activeSlide;
        return (
          <div
            key={slide.id}
            className={`${styles.ingredientsGroup} ${isActive ? styles.activeGroup : styles.inactiveGroup}`}
          >
            {almonds.map((item) => (
              <div
                key={item.id}
                className={styles.floatingAlmondContainer}
                style={{
                  left: item.left,
                  top: item.top,
                  animationDelay: item.delay,
                  animationDuration: item.duration,
                }}
              >
                <div
                  className={styles.almondRotationWrapper}
                  style={{
                    transform: `rotate(${item.rotate})`,
                  }}
                >
                  <img
                    src={
                      item.type === "single"
                        ? slide.singleAsset
                        : slide.clusterAsset
                    }
                    alt={`${slide.name} ingredient`}
                    className={styles.almondImg}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Central Bottle */}
      <div className={styles.bottleContainer}>
        {slides.map((slide, index) => {
          const isActive = index === activeSlide;
          return (
            <img
              key={slide.id}
              src={slide.bottleAsset}
              alt={slide.name}
              className={`${styles.bottleImg} ${isActive ? styles.activeBottle : styles.inactiveBottle}`}
            />
          );
        })}
      </div>

      {/* Slide Navigation Controls */}
      <button
        onClick={prevSlide}
        className={`${styles.controlBtn} ${styles.prevBtn}`}
        aria-label="Previous Slide"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <button
        onClick={nextSlide}
        className={`${styles.controlBtn} ${styles.nextBtn}`}
        aria-label="Next Slide"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      {/* Slide Indicator Dots */}
      <div className={styles.indicators}>
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setActiveSlide(index)}
            className={`${styles.indicatorDot} ${index === activeSlide ? styles.activeDot : ""}`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
