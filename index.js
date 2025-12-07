require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    // Collections
    const bioCollections = client.db("SoulFinderDB").collection("biodata");
    const userCollections = client.db("SoulFinderDB").collection("users");
    const favoriteCollection = client.db("SoulFinderDB").collection("favorite");
    const contactRequestCollection = client.db("SoulFinderDB").collection("contactRequest");
    const successStoriesCollection = client.db("SoulFinderDB").collection("successStory");
    const premiumRequestsCollection = client.db("SoulFinderDB").collection("premiumRequest");

    // Routes
    app.get("/", (req, res) => {
      res.send("Portal server is running");
    });

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

      res.send({ data: result, totalCount, totalPages, currentPage: parseInt(page) });
    });

    app.get("/all-bio/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userEmail = req.query.email;

      try {
        const biodata = await bioCollections.findOne({ _id: new ObjectId(id) });
        if (!biodata) return res.status(404).send({ message: "Biodata not found" });

        const favFilter = { setBy: userEmail, biodataId: biodata.biodataId };
        const isFavorite = await favoriteCollection.findOne(favFilter);
        biodata.isFavorite = !!isFavorite;

        res.send(biodata);
      } catch (error) {
        console.error("Error fetching biodata:", error);
        res.status(500).send({ message: "Something went wrong" });
      }
    });

    app.get("/my-bio/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await bioCollections.findOne({ email });
      res.send(result);
    });

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

    app.get("/all-users", async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });

    app.post("/favorite-bios", async (req, res) => {
      const { setBy, biodata } = req.body;
      const favoriteData = { ...biodata, setBy };

      const alreadyExists = await favoriteCollection.findOne({
        biodataId: biodata.biodataId,
        setBy,
      });

      if (alreadyExists) {
        return res.status(409).send({ message: "Already added to favorites." });
      }

      const result = await favoriteCollection.insertOne(favoriteData);
      res.send(result);
    });

    app.get("/favorite-bio", async (req, res) => {
      const result = await favoriteCollection.find().toArray();
      res.send(result);
    });

    app.delete("/favorite-bios/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const result = await favoriteCollection.deleteOne(filter);
      res.send(result);
    });

    // You can add more routes for contactRequest, successStory, premiumRequest here
  } finally {
    // await client.close(); // optional
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
