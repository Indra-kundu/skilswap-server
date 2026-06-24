const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dontenv.config();

const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT;
app.use(cors())

app.use(
    cors({
        credentials: true,
        origin: [process.env.CLIENT_URL],
    }),
);

app.use(express.json());



const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))


const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization;
    // console.log(authHeader)
    if (!authHeader || !authHeader.startsWith(`Bearer`)) {
        return res.status(401).json({ message: 'unauthorized' });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload; // ইউজারের তথ্য সেভ করা
        // console.log(payload);
        next();
    } catch (error) {
        console.log(error);
        return res.status(403).json({ message: "Forbidden" });
    }
    next()

};

const verifyClient = async (req, res, next) => {
    const user = req.user;
    if (user.role !== "client") {
        return res.status(403).json({ message: "Forbidden" });

    }
}

// const verifyFreelancer = async (req, res, next) => {
//     const user = req.user;
//     if (user.role !== "freelancer") {
//         return res.status(403).json({ message: "Forbidden" });

//     }
// }

// const verifyAdmin = async (req, res, next) => {
//     const user = req.user;
//     if (user.role !== "admin") {
//         return res.status(403).json({ message: "Forbidden" });

//     }
// }
async function run() {
    try {
        await client.connect();
        const db = client.db("skillswap");

        const tasksCollection = db.collection("tasks")

        app.get("/client/tasks/:email", async (req, res) => {
            const email = req.params.email; // যে ক্লায়েন্ট লগইন আছে তার ইমেইল
            const query = { client_email: email }; // যদি আপনি প্রতিটি টাস্কের সাথে ইমেইল সেভ করে থাকেন
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        });


        app.post("/client/tasks", verifyToken, verifyClient, async (req, res) => {
            const taskData = req.body;
            const result = await tasksCollection.insertOne(taskData);
            res.send(result);
        });
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Server is running fine!");
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});