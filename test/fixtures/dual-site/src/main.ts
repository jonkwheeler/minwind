import "./emitted.css";
import styles from "./Card.module.css";
import { App } from "./app";

const root = document.getElementById("root");
if (root !== null) {
  root.className = styles.flex;
  root.textContent = `${String(App)} ${styles.flex}`;
}
