import { Router, Request, Response } from "express";
import query, {log} from "../middlewares/db";
import { jwtAuth } from "../middlewares/jwt";
import config from '../config.json';
import { QueryResult } from "pg";
import moment from "moment-timezone";

// import { getDistanceBetweenPoints } from "../middlewares/locationHelpers";

const router = Router();

router.post('/book', jwtAuth, async (req: Request, res: Response) => {
    const tokenPayload : any = await res.locals.token as Object; // payload -> logged in User <-> giver
    try{
        const {rows : passengerId} : QueryResult = await query(`SELECT "userId" FROM "public.Users" WHERE email LIKE $1`, [tokenPayload.email]);
        // const {startLat, startLon, endLat, endLon} = req.query;
        const { startAddress, endAddress, passengerCount, startLat, startLon, endLat, endLon, distance, dateOfTrip } = req.body;
        if(startLat && startLon && endLat && endLon) {
            // const dateOfTrip_ = moment(dateOfTrip).format('Europe/Warsaw'); XD
            // const distanceBetweenPoints : number = getDistanceBetweenPoints(startLat as unknown as number, startLon as unknown as number, endLat as unknown as number, endLon as unknown as number);
            const {rowCount : bookQuery} : QueryResult = await query(`INSERT INTO "public.Trips"("passengerId", "dateOfBook", "startPoint", "endPoint", status, distance, "startAddress", "endAddress", "passengerCount", "dateOfTrip") VALUES($1, NOW(), POINT($2, $3), POINT($4, $5), $6, $7, $8, $9, $10, $11)`, [passengerId[0].userId, startLat, startLon, endLat, endLon, config.tripStatus.booked, distance, startAddress, endAddress, passengerCount, dateOfTrip]);
            if(bookQuery > 0) {
                 await log([`TRIP ACTION ${JSON.stringify(tokenPayload)} booked`, config.response_status.access, config.log_type.TRIPS]);
                res.json(config.messages.bookingSuccess).status(config.response_status.access);
             } else {
                 throw config.messages.bookingError;
             }
        } else {
            throw config.messages.bookingError;
        }
    } catch(error) {
        console.log(error)
        await log([`TRIP ACTION ${JSON.stringify(tokenPayload)} ${error}`, config.response_status.internalError, config.log_type.TRIPS]);
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
                    const { rowCount, rows: finalTripAfterCancelling } : QueryResult = await query(`SELECT * FROM "public.Trips" WHERE "tripId" = $1`, [tripId]);
                    if(rowCount > 0) {
                        await log([`TRIP ACTION ${JSON.stringify(tokenPayload)}, ${tripId} cancel`, config.response_status.access, config.log_type.TRIPS]);
                        res.json({...config.messages.tripCancelSuccess, cancelledTrip:finalTripAfterCancelling[0]}).status(config.response_status.access);
                    } else {
                        throw config.messages.tripCancelError;
                    }
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

// Offers (accepting offer from driver and declining)
router.post('/offerTrip/:id', jwtAuth, async (req: Request, res: Response) => {
    const { userId: driverId } = await res.locals.token;
    const tripId = req.params.id;
    try {
        const { suggestedPrice } = req.body;
        //Check if user is a driver
        const { rows : isDriverQuery } = await query(`SELECT "userId", email, "isDriver" FROM "public.Users" WHERE "userId" = $1`, [driverId]);
        if(isDriverQuery[0].isDriver) {
            // HERE CHECK IF DRIVER IS THE PASSENGER WHO BOOKED THE TRIP
            const {rows : checkIfDriverIsntPassenger} : QueryResult = await query(`SELECT "tripId", "passengerId" FROM "public.Trips" WHERE "tripId" = $1`, [tripId]);
            if(checkIfDriverIsntPassenger[0].passengerId == driverId) {
                await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)} cannot send offer to trip which belongs to you, ${tripId}`, config.response_status.prohibition, config.log_type.TRIPS]);
                res.json(config.messages.tripOfferingCannotOfferYourOwnTrip).status(config.response_status.prohibition);
            } else {
                const {rowCount : checkOfferStatus} : QueryResult = await query(`SELECT "tripId", "driverId" FROM "public.TripOffers" WHERE "driverId" = $1 AND "tripId" = $2`, [driverId, tripId]);
                if(checkOfferStatus > 0) {
                    await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)} cannot send two the same offers, ${tripId}`, config.response_status.prohibition, config.log_type.TRIPS]);
                    res.json(config.messages.tripOfferingSameOfferError).status(config.response_status.prohibition);
                } else {
                    const {rowCount : offerQuery} : QueryResult = await query(`INSERT INTO "public.TripOffers"("tripId", "dateOfOffer", "driverId", status, "suggestedPrice") VALUES($1, NOW(), $2, $3, $4)`, [tripId, driverId, config.tripOfferStatus.pending, suggestedPrice]);
                    if(offerQuery > 0) {
                        await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)}, ${tripId}`, config.response_status.access, config.log_type.TRIPS]);
                        res.json(config.messages.tripOfferingSuccess).status(config.response_status.access);
                    } else {
                        await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)}, ${tripId}`, config.response_status.internalError, config.log_type.TRIPS]);
                        res.json(config.messages.tripOfferingError).status(config.response_status.internalError);
                    }
                }
            }
        } else {
            //User is not a driver :(
            await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)} is not a driver, ${tripId}`, config.response_status.prohibition, config.log_type.TRIPS]);
            res.json(config.messages.userIsNotDriver).status(config.response_status.prohibition);
        }
    } catch(error) {
        // res with trip offering error!
        console.log(error)
        await log([`TRIP OFFERING ACTION ${JSON.stringify(driverId)}, ${tripId}`, config.response_status.internalError, config.log_type.TRIPS]);
        res.json(config.messages.tripOfferingError).status(config.response_status.internalError);
    }
})

router.post('/acceptOfferTrip/:id', jwtAuth, async (req: Request, res: Response) => {
    const { email: userEmail } = await res.locals.token;
    const tripOfferId = req.params.id;
    try {
        // Check if offer exists
        const { rowCount : ifIsPending } = await query(`SELECT status FROM "public.TripOffers" WHERE status LIKE $1 AND "tripOfferId" = $2`, [config.tripOfferStatus.pending, tripOfferId]);
        if(ifIsPending > 0) {
            // Check if trip belongs to user
            const { rowCount : ifBelongsToUser } = await query(`SELECT "userId", email, pt."tripId", pto."tripId" FROM "public.Users" pu join "public.Trips" pt ON pu."userId" = pt."passengerId" or pu."userId" = pt."driverId" join "public.TripOffers" pto ON pt."tripId" = pto."tripId" where pu.email like $1 AND pto."tripOfferId" = $2;`, [userEmail, tripOfferId]);
            if(ifBelongsToUser > 0) {
                await query(`BEGIN`, []);
                const { rows : tripIdQuery } = await query(`SELECT pt."tripId", pto."driverId" FROM "public.Trips" pt join "public.TripOffers" pto ON pt."tripId" = pto."tripId" where pto."tripOfferId" = $1;`, [tripOfferId]);
                const { rowCount : tripStatusCommit } : QueryResult = await query(`UPDATE "public.Trips" SET status=$1, "driverId" = $2, "dateOfAccept" = NOW() WHERE "tripId"=$3`, [config.tripStatus.active, tripIdQuery[0].driverId, tripIdQuery[0].tripId]);
                const { rowCount : tripOfferDeclineOther } : QueryResult = await query(`UPDATE "public.TripOffers" SET status=$1 WHERE "tripId"=$2 AND "tripOfferId" != $3`, [config.tripOfferStatus.declined, tripIdQuery[0].tripId, tripOfferId]);
                const { rowCount : acceptTripOfferQuery } : QueryResult = await query(`UPDATE "public.TripOffers" SET status=$1 WHERE "tripOfferId"=$2`, [config.tripOfferStatus.confirmed, tripOfferId]);
                await query(`COMMIT;`, []);
                if(tripStatusCommit > 0 && acceptTripOfferQuery > 0 && tripOfferDeclineOther >= 0) {
                    await log([`TRIP ACCEPTING OFFER ACTION ${JSON.stringify(userEmail)}, ${tripOfferId}`, config.response_status.access, config.log_type.TRIPS]);
                    res.json(config.messages.tripAcceptingOfferSuccess).status(config.response_status.access);
                } else {
                    await log([`TRIP ACCEPTING OFFER ACTION ${JSON.stringify(userEmail)} error with updating status, ${tripOfferId}`, config.response_status.internalError, config.log_type.TRIPS]);
                    res.json(config.messages.tripAcceptingOfferError).status(config.response_status.internalError);
                }
        } else {
                //This trip offer doesnt belong to user :(
                    await log([`TRIP ACCEPTING OFFER ACTION ${JSON.stringify(userEmail)} it doesnt belong to user, ${tripOfferId}`, config.response_status.prohibition, config.log_type.TRIPS]);
                    res.json(config.messages.tripAcceptOfferErrorWrongUser).status(config.response_status.prohibition);
            }
        }
        else {
            await log([`TRIP ACCEPTING OFFER ACTION ${JSON.stringify(userEmail)} already accepted or declined, ${tripOfferId}`, config.response_status.prohibition, config.log_type.TRIPS]);
            res.json(config.messages.tripOfferErrorAlreadyDeclinedOrAccepted).status(config.response_status.prohibition);
        }
    } catch(error) {
        console.log(error);
        // res with trip accepting offer error!
        await log([`TRIP ACCEPTING OFFER ACTION ${JSON.stringify(userEmail)}, ${tripOfferId}`, config.response_status.internalError, config.log_type.TRIPS]);
        res.json(config.messages.tripAcceptingOfferError).status(config.response_status.internalError);
    }
})

router.post('/declineOfferTrip/:id', jwtAuth, async (req: Request, res: Response) => {
    const { email: userEmail } = await res.locals.token;
    const tripOfferId = req.params.id;
    try {
        // Check if offer exists
        const { rowCount : ifIsPending } = await query(`SELECT status FROM "public.TripOffers" WHERE status LIKE $1 AND "tripOfferId" = $2`, [config.tripOfferStatus.pending, tripOfferId]);
        if(ifIsPending > 0) {
            // Check if trip belongs to user
            const { rowCount : ifBelongsToUser } = await query(`SELECT "userId", email, "tripId" FROM "public.Users" pu join "public.Trips" pt ON pu."userId" = pt."passengerId" or pu."userId" = pt."driverId"  where pu."email" LIKE $1;`, [userEmail]);
            if(ifBelongsToUser > 0) {
                const { rowCount : declineTripOfferQuery } : QueryResult = await query(`UPDATE "public.TripOffers" SET status=$1 WHERE "tripOfferId"=$2`, [config.tripOfferStatus.declined, tripOfferId]);
                if(declineTripOfferQuery > 0) {
                    await log([`TRIP DECLINING OFFER ACTION ${JSON.stringify(userEmail)}, ${tripOfferId}`, config.response_status.access, config.log_type.TRIPS]);
                    res.json(config.messages.tripDeclineOfferSuccess).status(config.response_status.access);
                } else {
                    await log([`TRIP DECLINING OFFER ACTION ${JSON.stringify(userEmail)} error with updating status, ${tripOfferId}`, config.response_status.internalError, config.log_type.TRIPS]);
                    res.json(config.messages.tripDeclineOfferError).status(config.response_status.internalError);
                }
        } else {
                //This trip offer doesnt belong to user :(
                    await log([`TRIP DECLINING OFFER ACTION ${JSON.stringify(userEmail)} it doesnt belong to user, ${tripOfferId}`, config.response_status.prohibition, config.log_type.TRIPS]);
                    res.json(config.messages.tripDeclineOfferErrorWrongUser).status(config.response_status.prohibition);
            }
        }
        else {
            await log([`TRIP DECLINING OFFER ACTION ${JSON.stringify(userEmail)} already declined or accepted, ${tripOfferId}`, config.response_status.prohibition, config.log_type.TRIPS]);
            res.json(config.messages.tripOfferErrorAlreadyDeclinedOrAccepted).status(config.response_status.prohibition);
        }
    } catch(error) {
        // res with trip declining offer error!
        await log([`TRIP DECLINING OFFER ACTION ${JSON.stringify(userEmail)}, ${tripOfferId}`, config.response_status.internalError, config.log_type.TRIPS]);
        res.json(config.messages.tripDeclineOfferError).status(config.response_status.internalError);
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

router.get('/fetchTripsByUserId/:id', jwtAuth, async (req : Request, res: Response) => {
    try {
        const userId = req.params.id;
        if(res.locals.isAdmin) {
            const { rows : trips} : QueryResult = await query(`select "tripId", "passengerId", "driverId", "dateOfBook","startPoint" ,"endPoint" ,status,"dateOfAccept","whoHasCanceled" ,distance ,"endAddress" ,"startAddress" ,"passengerCount"  from "public.Trips" pt join "public.Users" pu on pt."passengerId" = pu."userId" where pu."userId" = $1 and pt.status like 'BOOKED';;`, [userId]);
            res.json(trips).status(config.response_status.access);
        } else {
            const { rows : trips} : QueryResult = await query(`select "tripId", "passengerId", "driverId", "dateOfBook","startPoint" ,"endPoint" ,status,"dateOfAccept","whoHasCanceled" ,distance ,"endAddress" ,"startAddress" ,"passengerCount"  from "public.Trips" pt join "public.Users" pu on pt."passengerId" = pu."userId" where pu."userId" = $1 and pt.status like 'BOOKED';`, [userId]);
            res.json(trips).status(config.response_status.access);
        }
    } catch(err) { 
        res.json(config.messages.tripFetchingError).status(config.response_status.internalError);
    }
})

export default router;