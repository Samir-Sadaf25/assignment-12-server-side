require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(" portal server is running");
});
app.listen(port, () => {
  console.log(`server is running on port:${port}`);
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vvycnhh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const bioCollections = client.db("SoulFinderDB").collection("biodata");
    const userCollections = client.db("SoulFinderDB").collection("users");
    const favoriteCollection = client.db("SoulFinderDB").collection("favorite");
    const contactRequestCollection = client.db("SoulFinderDB").collection("contactRequest")
    const successStoriesCollection = client.db("SoulFinderDB").collection("successStory")
    const premiumRequestsCollection = client.db("SoulFinderDB").collection("premiumRequest")

    app.patch("/edit-bio-data", async (req, res) => {
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
    app.get("/all-bio", async (req, res) => {
      const result = await bioCollections.find().toArray();
      res.send(result);
    });
    app.get("/my-bio/:email", async (req, res) => {
      const email = req.params.email;
      const result = await bioCollections.findOne({ email: email });
      res.send(result);
    });
    app.post("/add-users", async (req, res) => {
      const userData = req.body;
      userData.role = "normal";
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      const query = {
        email: userData?.email,
      };
      const alreadyExists = await userCollections.findOne(query);

      if (!!alreadyExists) {
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




  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
