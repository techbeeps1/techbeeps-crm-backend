const Employability = require('../models/employabilityModel'); // Adjust path as needed



exports.getEmployabilityById = async (req, res) => {
    try {
        const employability = await Employability.findById(req.params.id);
        if (!employability) return res.status(404).json({ message: "Employability not found" });
        res.status(200).json(employability);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

