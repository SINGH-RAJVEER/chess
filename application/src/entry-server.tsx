import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/solid-start/server";

export default createStartHandler(defaultStreamHandler);
