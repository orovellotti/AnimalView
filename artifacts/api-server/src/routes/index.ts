import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import trackRouter from "./track";
import imageryRouter from "./imagery";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(trackRouter);
router.use(imageryRouter);

export default router;
