const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { ObjectId } = require('mongodb'); // এটি অবশ্যই ইমপোর্ট থাকতে হবে
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
        const proposalsCollection = db.collection("proposals");

        app.get("/client/tasks/:email", async (req, res) => {
            const email = req.params.email; // যে ক্লায়েন্ট লগইন আছে তার ইমেইল
            const query = { client_email: email }; // যদি আপনি প্রতিটি টাস্কের সাথে ইমেইল সেভ করে থাকেন
            const result = await tasksCollection.find(query).toArray();
            res.send(result);
        });

        // index.js (Backend)

        // টাস্ক আপডেট করার জন্য PATCH রিকোয়েস্ট
        app.patch("/tasks/:id", async (req, res) => {
            const id = req.params.id;
            const updatedInfo = req.body; // মডাল থেকে আসা ডেটা

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    title: updatedInfo.title,
                    description: updatedInfo.description,
                    budget: updatedInfo.budget,
                    deadline: updatedInfo.deadline
                },
            };

            try {
                const result = await tasksCollection.updateOne(filter, updateDoc);
                if (result.matchedCount > 0) {
                    res.send({ success: true, message: "Task updated successfully" });
                } else {
                    res.status(404).send({ message: "Task not found" });
                }
            } catch (error) {
                res.status(500).send({ message: "Update failed", error });
            }
        });

        app.post("/client/tasks", verifyToken, verifyClient, async (req, res) => {
            const taskData = req.body;
            const result = await tasksCollection.insertOne(taskData);
            res.send(result);
        });

        app.get("/all-tasks", async (req, res) => {
            try {
                const result = await tasksCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching all tasks" });
            }
        });
        app.get("/tasks/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) }; // আইডিটি ObjectId তে কনভার্ট করুন
                const result = await tasksCollection.findOne(query);

                if (!result) {
                    return res.status(404).send({ message: "Task not found" });
                }
                res.send(result);
            } catch (error) {
                console.error("Backend Error:", error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });


        // index.js বা আপনার মেইন সার্ভার ফাইলে এটি থাকতে হবে
        app.post("/proposals", async (req, res) => {
            const proposal = req.body;
            const result = await proposalsCollection.insertOne(proposal);
            res.send(result);
        });

        // সার্ভারের কোড
        app.get("/proposals/client/:email", async (req, res) => {
            const email = req.params.email;
            // এখানে আপনি প্রপোজালগুলো খুঁজছেন যেখানে টাস্কের মালিকের ইমেইল আপনার সেশন ইমেইলের সাথে মেলে
            const proposals = await proposalsCollection.find({ client_email: email }).toArray();
            res.send(proposals);
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