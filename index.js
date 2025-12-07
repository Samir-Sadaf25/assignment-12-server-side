require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SK_KEY);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Firebase Admin setup
const serviceAccount = require("./firebase-admin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vvycnhh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Middleware for token verification
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized Access" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access" });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.decoded = decodedToken;
    next();
  } catch (err) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
};

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    // Collections
    const db = client.db("SoulFinderDB");
    const bioCollections = db.collection("biodata");
    const userCollections = db.collection("users");
    const favoriteCollection = db.collection("favorite");
    const contactRequestCollection = db.collection("contactRequest");
    const successStoriesCollection = db.collection("successStory");
    const premiumRequestsCollection = db.collection("premiumRequest");

    // ----------------------------------------------
    // ROUTES
    // ----------------------------------------------

    app.get("/", (req, res) => {
      res.send("Portal server is running");
    });

    // ----------------------------------------------
    // GET ALL BIO (with filters + pagination)
    // ----------------------------------------------
    app.get("/all-bio", async (req, res) => {
      const { type, division, minAge, maxAge, limit = 20, page = 1 } = req.query;

      const filter = {};
      if (type) filter.biodataType = type;
      if (division) filter.permanentDivision = division;
      if (minAge || maxAge) {
        filter.age = {};
        if (minAge) filter.age.$gte = parseInt(minAge);
        if (maxAge) filter.age.$lte = parseInt(maxAge);
      }

      const queryLimit = parseInt(limit);
      const skip = (parseInt(page) - 1) * queryLimit;

      const totalCount = await bioCollections.countDocuments(filter);
      const result = await bioCollections.find(filter).skip(skip).limit(queryLimit).toArray();
      const totalPages = Math.ceil(totalCount / queryLimit);

      res.send({
        data: result,
        totalCount,
        totalPages,
        currentPage: parseInt(page),
      });
    });

    // ----------------------------------------------
    // PATCH / EDIT BIO DATA
    // ----------------------------------------------
    app.patch("/edit-bio-data", verifyToken, async (req, res) => {
      const data = req.body;
      const filter = { email: data?.email };

      const existing = await bioCollections.findOne(filter);

      if (existing) {
        const { BiodataId, ...rest } = data;
        const result = await bioCollections.updateOne(filter, { $set: rest });
        return res.send(result);
      }

      const count = await bioCollections.estimatedDocumentCount();
      const newBiodata = {
        BiodataId: count + 1,
        ...data,
      };

      const result = await bioCollections.insertOne(newBiodata);
      res.send(result);
    });

    // ----------------------------------------------
    // ADD TO FAVORITE
    // ----------------------------------------------
    app.post("/favorite-bios/:email", async (req, res) => {
      const setBy = req.params.email;
      const biodata = req.body;

      if (!setBy) return res.status(400).send({ message: "User email required" });
      if (!biodata?.BiodataId) return res.status(400).send({ message: "BiodataId required" });

      try {
        const updateResult = await favoriteCollection.updateOne(
          { BiodataId: biodata.BiodataId },
          { $addToSet: { setBy: setBy }, $setOnInsert: { ...biodata } },
          { upsert: true }
        );

        if (updateResult.upsertedCount > 0) {
          return res.send({ message: "Added to favorites (new doc created)" });
        } else if (updateResult.modifiedCount > 0) {
          return res.send({ message: "Added to favorites (added to setBy)" });
        }

        return res.status(409).send({ message: "Already added to favorites." });

      } catch (error) {
        console.error("Error adding favorite:", error);
        res.status(500).send({ message: "Failed to add favorite" });
      }
    });

    // ----------------------------------------------
    // GET USER ROLE
    // ----------------------------------------------
    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollections.findOne({ email });
      if (!result) return res.status(404).send({ message: "User Not Found." });
      res.send({ role: result?.role });
    });

    // ----------------------------------------------
    // MY BIO
    // ----------------------------------------------
    app.get("/my-bio/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await bioCollections.findOne({ email });
      res.send(result);
    });

    // ----------------------------------------------
    // ADD USER
    // ----------------------------------------------
    app.post("/add-users", async (req, res) => {
      const userData = req.body;

      userData.role = "normal";
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();

      const query = { email: userData?.email };
      const alreadyExists = await userCollections.findOne(query);

      if (alreadyExists) {
        const result = await userCollections.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        });
        return res.send(result);
      }

      const result = await userCollections.insertOne(userData);
      res.send(result);
    });

    // ----------------------------------------------
    // GET ALL USERS
    // ----------------------------------------------
    app.get("/all-users", async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });

    // ----------------------------------------------
    // GET FAVORITE BIO LIST
    // ----------------------------------------------
    app.get("/favorite-bio", async (req, res) => {
      const result = await favoriteCollection.find().toArray();
      res.send(result);
    });

    // ----------------------------------------------
    // GET SINGLE BIODATA + FAVORITE STATUS
    // ----------------------------------------------
    app.get("/get-bio/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userEmail = req.query.email;

      try {
        const filter = { _id: new ObjectId(id) };
        const biodata = await bioCollections.findOne(filter);

        if (!biodata) {
          return res.status(404).send({ message: "Biodata not found" });
        }

        const favFilter = {
          BiodataId: biodata.BiodataId,
          setBy: { $in: [userEmail] },
        };

        const isFavorite = await favoriteCollection.findOne(favFilter);
        biodata.isFavorite = !!isFavorite;

        res.send(biodata);

      } catch (error) {
        console.error("Error fetching biodata:", error);
        res.status(500).send({ message: "Something went wrong" });
      }
    });

    // ----------------------------------------------
    // DELETE FAVORITE
    // ----------------------------------------------
    app.delete("/favorite-bios/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userEmail = req.query.email;

      if (!userEmail) return res.status(400).send({ message: "User email required" });

      try {
        const updateResult = await favoriteCollection.updateOne(
          { _id: new ObjectId(id) },
          { $pull: { setBy: userEmail } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).send({ message: "Favorite not found or user not in favorites" });
        }

        const favoriteDoc = await favoriteCollection.findOne({ _id: new ObjectId(id) });

        if (favoriteDoc && (!favoriteDoc.setBy || favoriteDoc.setBy.length === 0)) {
          await favoriteCollection.deleteOne({ _id: new ObjectId(id) });
          return res.send({ message: "Favorite removed and document deleted" });
        }

        res.send({ message: "User removed from favorites" });

      } catch (error) {
        console.error("Error removing favorite:", error);
        res.status(500).send({ message: "Failed to remove favorite" });
      }
    });

    // ----------------------------------------------
    // SIMILAR BIODATA
    // ----------------------------------------------
    app.get("/similar-biodata/:type", async (req, res) => {
      const biodataType = req.params.type;
      const excludeId = req.query.exclude;

      try {
        const filter = {
          biodataType,
          _id: { $ne: new ObjectId(excludeId) },
        };

        const similar = await bioCollections.find(filter).limit(3).toArray();
        res.send(similar);

      } catch (error) {
        console.error("Error fetching similar biodata:", error);
        res.status(500).send({ message: "Failed to fetch similar biodata" });
      }
    });

    // ----------------------------------------------
    // STRIPE PAYMENT INTENT
    // ----------------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const amount = req.body?.amount;
      const fee = amount * 100;

      const { client_secret } = await stripe.paymentIntents.create({
        amount: fee,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
      });

      res.send({ clientSecret: client_secret });
    });

    // ----------------------------------------------
    // CONTACT REQUEST
    // ----------------------------------------------
    app.post("/contact-req", async (req, res) => {
      const data = req.body;
      const result = await contactRequestCollection.insertOne(data);
      res.send(result);
    });

    app.get("/contact-req", async (req, res) => {
      const result = await contactRequestCollection.find().toArray();
      res.send(result);
    });

  } finally {
    // optional: you may close the client if needed
  }
}

run().catch(console.dir);

// ----------------------------------------------
// SERVER LISTEN
// ----------------------------------------------
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
