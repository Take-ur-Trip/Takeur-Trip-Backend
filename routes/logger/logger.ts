import Router, {Request, Response} from "express";
import { jwtAuth } from "../../middlewares/jwt";
import config from "../../config.json";
import query from "../../middlewares/db";

const router = Router();

router.get('/fetch', jwtAuth, async (req : Request, res: Response) => {
    try {
        const { rows : logs} = await query(`SELECT * FROM "public.Logs"`, []);
        res.json(logs).status(config.response_status.access);
    } catch(err) { 
        res.json(config.messages.fetchingUserError).status(config.response_status.prohibition);
    }
})

export default router;