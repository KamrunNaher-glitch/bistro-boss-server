const express = require('express');
const app = express();
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;



// middleware 
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sou5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("bistroDb").collection("users");
    const menuCollection = client.db("bistroDb").collection("menu");
    const reviewCollection = client.db("bistroDb").collection("reviews");
    const cartCollection = client.db("bistroDb").collection("carts");
    const paymentCollection = client.db("bistroDb").collection("payments");

    // JWT related API 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token });
    })
    // middleWare
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized accesss' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }
    // user verify admin after verify Token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({  message: 'forbidden message' });
      }
      next();
    }

    // Users Related API

    app.get('/users', verifyToken,verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email',verifyToken,async (req,res)=>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message : 'forbidden access'})
      }
      const query = {email:email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user) {
        admin = user?.role === 'admin';
      }
      res.send({admin});

    })



    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exist', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/admin/:id',verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id',verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) }
      
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // Menu Related API 
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
   
    app.get('/menu/:id',async (req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await menuCollection.findOne(query);
      res.send(result);
    })
    app.post('/menu', verifyToken, verifyAdmin, async (req,res)=>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    })
    app.patch('/menu/:id',async (req,res)=>{
      const item = req.body;
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        }
      }
      const result = await menuCollection.updateOne(filter,updatedDoc)
      res.send(result);
    })

    app.delete('/menu/:id', verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })


    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // Carts Collection 
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })


    app.post('/carts', async (req, res) => {
      const carItem = req.body;
      const result = await cartCollection.insertOne(carItem);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result);
    })
    // Payment Intent
    app.post('/create-payment-intent',async (req,res) =>{
      const {price} = req.body;
      const amount = parseInt(price * 100);
      console.log(amount,'amount inside the intent')
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency:'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret : paymentIntent.client_secret
      })

    })
    // Payment Related API 

    app.get('/payments/:email', verifyToken, async(req,res)=>{
      const query = {email:req.params.email};
      if(req.params.email !== req.decoded.email){
        return res.status(403).send({message:'forbidden accesss'});
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })
    app.post('/payments',async(req,res)=>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log('payment info',payment);
      const query = {_id:{
        $in: payment.cartId.map(id => new ObjectId(id))
      }};
      const deleteResult = await cartCollection.deleteMany(query);
      // send Email



     res.send({paymentResult,deleteResult});

    })

    // Stats or Analytics
    app.get('/admin-stats', verifyToken,verifyAdmin, async(req,res)=>{
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total,payment) => total + payment.price,0)
      const result = await paymentCollection.aggregate([
        {
         $group:{
          _id: null,
          totalRevenue:{
            $sum: '$price'
          }
         } 
        }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({users,menuItems,orders,revenue})
    })

    // Order Status 

    app.get('/order-stats',verifyToken,verifyAdmin, async(req,res) =>{
      const result = await paymentCollection.aggregate([
        {
          $unwind:'$menuItemId'
        },
        {
         $lookup:{
          from:'menu',
          localField:'menuItemId',
          foreignField:'_id',
          as:'menuItems'
         } 
        },
        {
          $unwind:'$menuItems'
        },
        {
          $group:{
            _id: '$menuItems.category',
            quantity:{$sum: 1},
            revenue:{$sum: '$menuItems.price'}
          }
        },
        {
          $project:{
            _id:0,
            category:'$_id',
            quantity:'$quantity',
            revenue:'$revenue',
          }
        }

      ]).toArray();
      res.send(result);
    })




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Boss is Sitting')
})
app.listen(port, () => {
  console.log(`Bistro Boss is Sitting on PORT ${port}`)
})
