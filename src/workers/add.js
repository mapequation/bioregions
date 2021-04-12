import { expose } from "threads/worker";

expose(function add(x, y) {
  return x + y;
});
