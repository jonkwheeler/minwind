// A stand-in for a motion library such as GSAP (R10). It writes inline
// styles by value and declares static fields, so its built code mentions
// utility names that never reach a class list. The mark is not ASCII and
// lands before those mentions on the chunk's one minified line, so
// attribution must count sourcemap columns in UTF-16 code units.
export class Tween {
  static defaults = { duration: 0.3 };
  static active = [];
  static mark = "✦";

  constructor(target) {
    this.target = target;
    Tween.active.push(this);
  }

  play() {
    this.target.style.display = "block";
    Object.assign(this.target.style, { position: "absolute" });
  }
}

export function tween(target) {
  const motion = new Tween(target);
  motion.play();
  return motion;
}
