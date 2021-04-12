import { expose } from "threads/worker";

expose({
  bin() {
    return "hello, world!";
  },
});
