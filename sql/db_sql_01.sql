CREATE TABLE "public.Users" (
	"userId" serial NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"password" varchar(255) NOT NULL,
	"isDriver" BOOLEAN(255) NOT NULL,
	"pricing" float4(255),
	"bio" TEXT(255),
	"phone" varchar(15),
	"isBanned" BOOLEAN(255),
	"lastLocation" TEXT(255),
	"accountCreated" TIMESTAMP(255) NOT NULL,
	CONSTRAINT "Users_pk" PRIMARY KEY ("userId")
) WITH (
  OIDS=FALSE
);



CREATE TABLE "public.Ratings" (
	"ratingId" serial NOT NULL,
	"userId" int NOT NULL,
	"amount" int NOT NULL,
	CONSTRAINT "Ratings_pk" PRIMARY KEY ("ratingId")
) WITH (
  OIDS=FALSE
);



CREATE TABLE "public.Trips" (
	"tripId" serial NOT NULL,
	"passengerId" int NOT NULL,
	"driverId" int NOT NULL,
	"dateOfTrip" TIMESTAMP,
	"startPoint" TEXT,
	"endPoint" TEXT,
	"hasDone" BOOLEAN,
	CONSTRAINT "Trips_pk" PRIMARY KEY ("tripId")
) WITH (
  OIDS=FALSE
);




ALTER TABLE "Ratings" ADD CONSTRAINT "Ratings_fk0" FOREIGN KEY ("userId") REFERENCES "Users"("userId");

ALTER TABLE "Trips" ADD CONSTRAINT "Trips_fk0" FOREIGN KEY ("passengerId") REFERENCES "Users"("userId");
ALTER TABLE "Trips" ADD CONSTRAINT "Trips_fk1" FOREIGN KEY ("driverId") REFERENCES "Users"("userId");




