const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    typeOfCustomer:String,
    firstName:String,
    lastName:String,
    gender:String,
    email:String,
    contact:Number,
    findUs:String,
    city:String,
    postcode:String,
    taal:String,
    status:{
        type: String,
        default: 'New',
    },
    leadIndex: {
        type: Number,
        index: true,
      },
    
   
});

leadSchema.pre('save', async function () {
    if (this.isNew) {
      try {
        const lastLead = await this.constructor
          .findOne()
          .sort({ leadIndex: -1 });
        this.leadIndex = lastLead ? lastLead.leadIndex + 1 : 1;
      } catch (error) {
        throw error;
      }
    }
  });

module.exports = mongoose.model('Lead', leadSchema);