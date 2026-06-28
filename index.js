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

};

const verifyClient = async (req, res, next) => {
    const user = req.user;
    if (user.role !== "client") {
        return res.status(403).json({ message: "Forbidden" });

    }
    next(); // এটি অবশ্যই যোগ করুন
};

const verifyFreelancer = async (req, res, next) => {
    const user = req.user;
    if (user.role !== "freelancer") {
        return res.status(403).json({ message: "Forbidden" });

    }
    next(); // এটি অবশ্যই যোগ করুন!
};

const verifyAdmin = async (req, res, next) => {
    const user = req.user;
    if (user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });

    }
    next(); // এটি অবশ্যই যোগ করুন!
};

async function run() {
    try {
        // await client.connect();
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
                // এখানে ফিল্টার হিসেবে { status: "Open" } যোগ করুন
                const result = await tasksCollection.find({ status: "Open" }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching open tasks" });
            }
        });

        app.get("/open-tasks", async (req, res) => {
            try {
                // শুধুমাত্র ওপেন স্ট্যাটাসের টাস্কগুলো ফিল্টার করা হচ্ছে
                const query = { status: "Open" };
                const result = await tasksCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching open tasks" });
            }
        });

        // নিশ্চিত করুন এটি আছে (প্যারামিটার সহ)
        app.get("/proposals/:email", async (req, res) => {
            const email = req.params.email;
            const result = await proposalsCollection.find({ freelancer_email: email }).toArray();
            res.send(result);
        });

        app.put('/freelancer/update', async (req, res) => {
            const { email, name, bio, skills } = req.body;
            const result = await db.collection('freelancers').updateOne(
                { email },
                { $set: { name, bio, skills } }
            );
            res.send(result);
        });

        // ১. সব ইউজার পাওয়ার জন্য
        app.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
            const users = await db.collection("user").find().toArray();
            res.send(users);
        });

        // ২. ব্লক বা আনব্লক করার জন্য (isBlocked ফিল্ড ব্যবহার করে)
        app.patch('/admin/users/:id', async (req, res) => {
            const id = req.params.id;
            const { isBlocked } = req.body;
            const filter = { _id: new require('mongodb').ObjectId(id) };
            const updateDoc = { $set: { isBlocked: isBlocked } };

            const result = await db.collection("user").updateOne(filter, updateDoc);
            res.send(result);
        });


        // ১. সব টাস্ক দেখার জন্য
        app.get('/tasks', async (req, res) => {
            const tasks = await db.collection("tasks").find().toArray();
            res.send(tasks);
        });

        // ২. টাস্ক ডিলিট করার জন্য
        app.delete('/tasks/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new require('mongodb').ObjectId(id) };
            const result = await db.collection("tasks").deleteOne(query);
            res.send(result);
        });


        app.get('/admin/payments', async (req, res) => {
            try {
                const payments = await db.collection("payments").find().toArray();
                res.send(payments);
            } catch (error) {
                res.status(500).send({ message: "Error fetching payments" });
            }
        });


        // Admin Stats API
        app.get('/admin-stats', async (req, res) => {
            try {
                // এখানে "user" কালেকশন ব্যবহার করুন (আপনার ডাটা ফরম্যাট অনুযায়ী)
                const totalUsers = await db.collection("user").estimatedDocumentCount();

                const totalTasks = await db.collection("tasks").estimatedDocumentCount();
                const activeTasks = await db.collection("tasks").countDocuments({ status: "Open" });

                const payments = await db.collection("payments").find().toArray();
                const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

                res.send({
                    totalUsers,
                    totalTasks,
                    totalRevenue,
                    activeTasks
                });
            } catch (error) {
                res.status(500).send({ message: "Error" });
            }
        });



        app.get('/client-stats', async (req, res) => {
            const email = req.query.email;

            // ডাটাবেস ফিল্ডের নাম এবং ভ্যালুর সাথে মিলিয়ে কুয়েরি আপডেট করা হলো
            const query = { client_email: email };

            try {
                const totalTasks = await db.collection("tasks").countDocuments(query);

                // ডাটাবেসে স্ট্যাটাস "Open" (বড় হাতের 'O') আছে
                const openTasks = await db.collection("tasks").countDocuments({
                    ...query,
                    status: "Open"
                });

                const inProgress = await db.collection("tasks").countDocuments({
                    ...query,
                    status: "In Progress"
                });

                res.send({ totalTasks, openTasks, inProgress, totalSpent: 0 });
            } catch (error) {
                res.status(500).send({ message: "Error" });
            }
        });

        app.get("/freelancers", async (req, res) => {
            try {
                // নিশ্চিত করুন 'users' কালেকশনটি সঠিক। 
                // আপনার ডাটাবেস কি 'skillswap'? তাহলে কোডটি এমন হবে:
                const freelancers = await db.collection("user").find({ role: "freelancer" }).toArray();
                res.send(freelancers);
            } catch (error) {
                res.status(500).send({ message: "Error" });
            }
        });

        app.get("/task-title/:id", async (req, res) => {
            const id = req.params.id;
            // আইডি ম্যাচ করার জন্য ObjectId ব্যবহার করুন
            const query = { _id: new ObjectId(id) };
            const task = await tasksCollection.findOne(query);
            res.send({ title: task ? task.title : "Not Found" });
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

            try {
                const proposals = await proposalsCollection.aggregate([
                    { $match: { client_email: email, status: "Pending" } }, {
                        $addFields: {
                            task_id_obj: {
                                $cond: {
                                    if: { $eq: [{ $type: "$task_id" }, "string"] },
                                    then: { $toObjectId: "$task_id" },
                                    else: "$task_id"
                                }
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "tasks",
                            // এখানে ভুল ছিল: আপনাকে অবশ্যই 'task_id_obj' ব্যবহার করতে হবে
                            localField: "task_id_obj",
                            foreignField: "_id",
                            as: "taskInfo"
                        }
                    },
                    { $unwind: "$taskInfo" },
                    {
                        $project: {
                            freelancer_name: 1,
                            budget: 1,
                            note: 1,
                            status: 1,
                            task_id: 1,
                            task_title: "$taskInfo.title"
                        }
                    }
                ]).toArray();

                res.send(proposals);
            } catch (error) {
                console.error("Aggregation Error:", error);
                res.status(500).send({ message: "Error fetching proposals" });
            }
        });

        // ১. পেমেন্ট সেশন তৈরির রাউট (Stripe-এর জন্য)
        app.post("/create-checkout-session", verifyToken, async (req, res) => {
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
        // index.js (ব্যাকএন্ড)
        app.patch("/confirm-session", verifyToken, async (req, res) => {
            try {
                const { proposalId, taskId, sessionId } = req.body;

                // ১. লগ দিয়ে দেখুন ব্রাউজার কী পাঠাচ্ছে
                console.log("RECEIVED DATA:", req.body);

                // ২. আইডিগুলো ভ্যালিড কিনা চেক করুন
                if (!proposalId || !taskId || proposalId.length !== 24 || taskId.length !== 24) {
                    console.error("INVALID ID FORMAT:", { proposalId, taskId });
                    return res.status(400).send({ message: "Invalid ID length/format" });
                }

                const pId = new ObjectId(proposalId);
                const tId = new ObjectId(taskId);

                // ৩. অপারেশন
                await proposalsCollection.updateOne({ _id: pId }, { $set: { status: "Accepted" } });
                await tasksCollection.updateOne({ _id: tId }, { $set: { status: "In Progress" } });

                // অন্যান্য প্রপোজাল রিজেক্ট করা
                await proposalsCollection.updateMany(
                    { task_id: taskId, _id: { $ne: pId } },
                    { $set: { status: "Rejected" } }
                );

                await paymentsCollection.insertOne({
                    proposal_id: pId,
                    task_id: tId,
                    session_id: sessionId,
                    payment_status: "Paid",
                    paid_at: new Date()
                });

                res.send({ success: true, message: "Updated" });
            } catch (error) {
                console.error("CRITICAL BACKEND ERROR:", error);
                res.status(500).send({ message: "Server Error", error: error.message });
            }
        });

        app.get("/proposals/check/:taskId", async (req, res) => {
            try {
                const taskId = req.params.taskId;
                // ডাটাবেস থেকে চেক করা হচ্ছে কোনো 'Accepted' প্রপোজাল আছে কি না
                const count = await proposalsCollection.countDocuments({
                    task_id: taskId,
                    status: "Accepted"
                });
                res.send({ hasApproved: count > 0 });
            } catch (error) {
                res.status(500).send({ message: "Server error" });
            }
        });

        // ২. টাস্ক ডিলিট করার রাউট
        app.delete("/tasks/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await tasksCollection.deleteOne(query);

                if (result.deletedCount === 1) {
                    res.send({ success: true });
                } else {
                    res.status(404).send({ message: "Task not found" });
                }
            } catch (error) {
                res.status(500).send({ message: "Delete failed" });
            }
        });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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

