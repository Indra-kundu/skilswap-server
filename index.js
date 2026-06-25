const express = require("express");
const dontenv = require("dotenv");
dontenv.config();

const stripePackage = require('stripe');
const app = express();
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { ObjectId } = require('mongodb'); // এটি অবশ্যই ইমপোর্ট থাকতে হবে

const uri = process.env.MONGODB_URI;
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
        const paymentsCollection = db.collection("payments"); // এটি নতুন যোগ করুন

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

        app.patch("/proposals/:id", async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const result = await proposalsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: status } }
            );
            res.send(result);
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

        // ১. পেমেন্ট সেশন তৈরির রাউট (Stripe-এর জন্য)
        app.post("/create-checkout-session", async (req, res) => {
            const { price, proposalId, taskId } = req.body;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: { name: 'Task Payment' },
                        unit_amount: Math.round(price * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                // পেমেন্ট সফল হলে ইউজার আপনার সাকসেস পেজে ফিরে আসবে
                success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&proposal_id=${proposalId}&task_id=${taskId}`,
                cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
            });

            res.send({ url: session.url });
        });

        // ২. পেমেন্ট সফল হওয়ার পর স্ট্যাটাস আপডেটের রাউট
        app.patch("/confirm-session", async (req, res) => {
            const { proposalId, taskId, sessionId } = req.body;

            // ১. প্রপোজাল স্ট্যাটাস 'Accepted' করা
            await proposalsCollection.updateOne(
                { _id: new ObjectId(proposalId) },
                { $set: { status: "Accepted" } }
            );

            // ২. টাস্ক স্ট্যাটাস 'In Progress' করা
            await tasksCollection.updateOne(
                { _id: new ObjectId(taskId) },
                { $set: { status: "In Progress" } }
            );

            // ৩. ঐ টাস্কের বাকি সব প্রপোজাল 'Rejected' করা
            await proposalsCollection.updateMany(
                { task_id: taskId, _id: { $ne: new ObjectId(proposalId) } },
                { $set: { status: "Rejected" } }
            );

            // ৪. পেমেন্ট কালেকশনে ডাটা সেভ করা (আপনার নতুন রিকোয়ারমেন্ট)
            await paymentsCollection.insertOne({
                proposal_id: new ObjectId(proposalId),
                task_id: new ObjectId(taskId),
                session_id: sessionId, // নতুন যোগ করা
                payment_status: "Paid",
                paid_at: new Date()
            });
            const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
            res.send({ success: true, taskTitle: task.title, price: task.budget });
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