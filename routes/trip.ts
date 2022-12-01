import { Router, Request, Response } from "express";
import query, {log} from "../middlewares/db";
import { jwtAuth } from "../middlewares/jwt";
import config from '../config.json';
import { QueryResult } from "pg";
import { getDistanceBetweenPoints } from "../middlewares/locationHelpers";

const router = Router();

router.post('/book', jwtAuth, async (req: Request, res: Response) => {
    const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
    try{
        const {rows : passengerId} : QueryResult = await query(`SELECT "userId" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        const {startLat, startLon, endLat, endLon} = req.query;
        const { startAddress, endAddress } = req.body;
       const distanceBetweenPoints : number = getDistanceBetweenPoints(startLat as unknown as number, startLon as unknown as number, endLat as unknown as number, endLon as unknown as number);
       const {rowCount : bookQuery} : QueryResult = await query(`INSERT INTO "public.Trips"("passengerId", "dateOfBook", "startPoint", "endPoint", status, distance, "startAddress", "endAddress") VALUES($1, NOW(), POINT($2, $3), POINT($4, $5), $6, $7, $8, $9)`, [passengerId[0].userId, startLat, startLon, endLat, endLon, config.tripStatus.booked, distanceBetweenPoints, startAddress, endAddress]);
       if(bookQuery > 0) {
            await log([`TRIP ACTION ${JSON.stringify(tokenPayload)} booked`, config.response_status.access, config.log_type.TRIPS]);
           res.json(config.messages.bookingSuccess).status(config.response_status.access);
        } else {
            throw config.messages.bookingError;
        }
    } catch(error) {
        await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}`, config.response_status.internalError, config.log_type.TRIPS]);
        res.json(config.messages.bookingError).status(config.response_status.internalError);
    }
})

router.post('/cancelTrip/:id', jwtAuth, async(req: Request, res: Response) => {
    const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
    const tripId = req.params.id;
    try {
        const { rows : cancelTripQuery } : QueryResult = await query(`SELECT u1.email as "driverEmail", u2.email "passengerEmail", status, "driverId", "passengerId", "startPoint", "endPoint" FROM "public.Trips" t JOIN "public.Users" "u1" ON u1."userId"=t."driverId" JOIN "public.Users" "u2" ON u2."userId"=t."passengerId" WHERE "tripId" = $1`, [tripId as string]);
        if(cancelTripQuery[0].status == config.tripStatus.canceled) {
            await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel`, config.response_status.prohibition, config.log_type.TRIPS]);
            res.json(config.messages.tripAlreadyCanceled).status(config.response_status.prohibition)
        } else {
            if(!(cancelTripQuery[0].passengerEmail == tokenPayload.email || cancelTripQuery[0].driverEmail == tokenPayload.email)) {
                res.json(config.messages.tripCancelAuthError).status(config.response_status.prohibition);
            } else {
                const { rowCount } : QueryResult = await query(`UPDATE "public.Trips" SET status=$1, "whoHasCanceled"=$2 WHERE "tripId"=$3`, [config.tripStatus.canceled, tokenPayload.email, tripId]);
                if(rowCount > 0) {
                    await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel`, config.response_status.access, config.log_type.TRIPS]);
                   res.json(config.messages.tripCancelSuccess).status(config.response_status.access);
                } else {
                    await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel`, config.response_status.internalError, config.log_type.TRIPS]);
                    res.json(config.messages.tripCancelError).status(config.response_status.internalError);
                }
            }
        }
    } catch(error) {
        await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel`, config.response_status.internalError, config.log_type.TRIPS]);
        res.json(config.messages.tripCancelError).status(config.response_status.internalError)
    }
})

router.post('/acceptTrip/:id', jwtAuth, async (req: Request, res: Response) => {
    try {
        //check if logged in user is driver
        const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
        const {rows : driverQuery} : QueryResult = await query(`SELECT "userId", "isDriver" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        const tripId = req.params.id;
        if(driverQuery[0].isDriver) {
            // handle...
            const { rows : tripQuery } : QueryResult = await query(`SELECT status, "driverId", "passengerId", "startPoint", "endPoint" FROM "public.Trips" WHERE "tripId" = $1`, [tripId as string]);
            if(tripQuery[0].status == config.tripStatus.active) {
                await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} accept`, config.response_status.prohibition, config.log_type.TRIPS]);
                res.json(config.messages.tripAlreadyAccepted).status(config.response_status.prohibition);
            } else {
                if(tripQuery[0].status == config.tripStatus.canceled) {
                    res.json(config.messages.tripPreviouslyCanceled).status(config.response_status.prohibition);
                    await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel (previously canceled)`, config.response_status.prohibition, config.log_type.TRIPS]);
                } else {
                    if(tripQuery[0].passengerId == driverQuery[0].userId) {
                        await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} accept`, config.response_status.prohibition, config.log_type.TRIPS]);
                        res.json(config.messages.cannotAcceptSelfTrip).status(config.response_status.prohibition);
                    } else {
                        const { rowCount : acceptTripQuery } : QueryResult = await query(`UPDATE "public.Trips" SET "driverId" = $1, status = $2, "dateOfAccept" = NOW() WHERE "tripId" = $3`, [driverQuery[0].userId, config.tripStatus.active, tripId]);
                        if(acceptTripQuery < 1) {
                            await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId}`, config.response_status.internalError, config.log_type.TRIPS]);
                            res.json(config.messages.acceptingTripError).status(config.response_status.internalError);
                        } else {
                            const { x : lat1, y: lng1 } = tripQuery[0].startPoint;
                            const { x : lat2, y: lng2 } = tripQuery[0].endPoint;
                            const distanceBetweenPoints : number = getDistanceBetweenPoints(lat1, lng1, lat2, lng2);
                            await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId}`, config.response_status.access, config.log_type.TRIPS]);
                            res.json({...config.messages.acceptingTripSuccess, ...{startPoint: tripQuery[0].startPoint}, ...{endPoint:tripQuery[0].endPoint}, ...{distance: distanceBetweenPoints}}).status(config.response_status.access);
                        }
                    }
                }
            }
        } else {
            await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} USER IS NOT A DRIVER`, config.response_status.prohibition, config.log_type.TRIPS]);
            res.json(config.messages.userIsNotDriver).status(config.response_status.prohibition);
        }
    } catch(error) {
        res.json(config.messages.acceptingTripError).status(config.response_status.internalError);
    }
})

router.get('/fetch', jwtAuth, async (req : Request, res: Response) => {
    try {
        if(res.locals.isAdmin) {
            const { rows : trips} : QueryResult = await query(`SELECT * FROM "public.Trips"`, []);
            res.json(trips).status(config.response_status.access);
        } else {
            const { rows : trips} : QueryResult = await query(`SELECT * FROM "public.Trips"`, []);
            res.json(trips).status(config.response_status.access);
        }
    } catch(err) { 
        res.json(config.messages.tripFetchingError).status(config.response_status.internalError);
    }
})

router.get('/fetch/:id', jwtAuth, async (req : Request, res: Response) => {
    try {
        if(res.locals.isAdmin) {
            const tripId = req.params.id;
            const { rows : trips} : QueryResult = await query(`SELECT * FROM "public.Trips" WHERE "tripId" = $1`, [tripId]);
            res.json(trips).status(config.response_status.access);
        } else {
            const tripId = req.params.id;
            const { rows : trips} : QueryResult = await query(`SELECT * FROM "public.Trips" WHERE "tripId" = $1`, [tripId]);
            res.json(trips).status(config.response_status.access);
        }
    } catch(err) { 
        res.json(config.messages.tripFetchingError).status(config.response_status.internalError);
    }
})

export default router;