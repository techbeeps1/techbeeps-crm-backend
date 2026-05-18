const Inputs = require('../models/dynamicInputModel');

// Create a new input
exports.createInput = async (req, res) => {
    try {
        const input = new Inputs(req.body);
        const savedInput = await input.save();
        res.status(201).json(savedInput);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all inputs
exports.getAllInputs = async (req, res) => {
    let {inputFor , name} = req.query;
    try {
        const filter = inputFor ? { inputFor } : {};
        if(name){
            filter.name = new RegExp(name, 'i');
        }
        const inputs = await Inputs.find(filter);
        res.status(200).json(inputs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single input by ID
exports.getInputById = async (req, res) => {
    try {
        const input = await Inputs.findById(req.params.id);
        if (!input) return res.status(404).json({ message: "Input not found" });
        res.status(200).json(input);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update an input by ID
exports.updateInputById = async (req, res) => {
    try {
        const updatedInput = await Inputs.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true}
        );
        if (!updatedInput) return res.status(404).json({ message: "Input not found" });
        res.status(200).json(updatedInput);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete an input by ID
exports.deleteInputById = async (req, res) => {
    try {
        const deletedInput = await Inputs.findByIdAndDelete(req.params.id);
        if (!deletedInput) return res.status(404).json({ message: "Input not found" });
        res.status(200).json({ message: "Input deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
