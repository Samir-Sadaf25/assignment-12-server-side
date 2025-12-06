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


  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
