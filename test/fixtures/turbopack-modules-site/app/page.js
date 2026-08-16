"use client";

import styles from "./Card.module.css";

export default function Page() {
  return (
    <main>
      <div className={styles.root}>card</div>
      <p className={styles.title}>title</p>
      <span className="NotAModule-module__zzz__nope">decoy</span>
    </main>
  );
}
