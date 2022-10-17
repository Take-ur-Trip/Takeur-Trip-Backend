import { Router, Response, Request } from "express";
import query from "../middlewares/db";
import { jwtAuth } from "../middlewares/jwt";
import config from "../config.json";
const router = Router();

// Add rating
router.post('/rate/:userId', jwtAuth, async (req: Request, res: Response) => {
    const userId : string = req.params.userId as string;
    const amount : string | any = req.query.amount as string;
    const tokenPayload = res.locals.token; // payload -> logged in User <-> giver
    try {
        if(!(parseInt(amount) > 5 || parseInt(amount) < 1 || isNaN(parseInt(amount)))) {
            const { rows : findEmail } = await query(`SELECT "userId" FROM "public.Users" WHERE email = $1`, [tokenPayload]);
            const { rowCount : addRateQuery } = await query(`INSERT INTO "public.Ratings" ("userId", amount, userwhogave) VALUES($1, $2, $3)`, [userId, amount || null, findEmail[0].userId])
            if(addRateQuery < 1) {
                throw config.messages.addingRatingError;
            } else {
                res.json(config.messages.rateSuccessfulAdded);
            }
        } else {
            throw config.messages.addingRatingError;
        }
    } catch(error) {
        res.json(config.messages.addingRatingError);
    }
})

//Fetch rate of  user
router.get('/:userId', jwtAuth, async (req: Request, res: Response) => {
    const userId : string = req.params.userId as string;
    try {
        const { rows : userRating } = await query(`SELECT amount, email FROM "public.Ratings" as "r","public.Users" as "u" WHERE "r"."userId" = $1 AND "r"."userId" = "u"."userId"`, [userId]);
        let avgRating : number = 0;
        for(const rating of userRating) {
            avgRating += rating.amount as number;
        }
        avgRating /= userRating.length;
        const resObject : Object = { email: userRating[0].email, avgAmount: Math.round(avgRating)}
        res.json(resObject);
    } catch(error) {
        res.json(config.messages.fetchRatingError)
    }
}) 

export default router;