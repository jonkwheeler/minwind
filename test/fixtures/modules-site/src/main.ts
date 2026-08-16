import styles from "./Button.module.css";
import composed from "./composed.module.css";

const root = document.getElementById("root");
if (root !== null) {
  root.className = `${styles.root} ${composed.button}`;
  root.textContent = `${styles.root} ${composed.button}`;
}
