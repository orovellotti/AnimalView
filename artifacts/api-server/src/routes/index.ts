import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import trackRouter from "./track";
import imageryRouter from "./imagery";
import simulateRouter from "./simulate";
import weatherRouter from "./weather";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(trackRouter);
router.use(imageryRouter);
router.use(simulateRouter);
router.use(weatherRouter);

export default router;
