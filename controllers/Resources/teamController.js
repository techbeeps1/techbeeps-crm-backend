
const { Team } = require('../../models/Resources/team');

// Create a new team
exports.createTeam = async (req, res) => {
    const { teamName, members } = req.body;
    try {
        const team = new Team({ teamName, members });
        await team.save();
        res.status(201).json(team);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all teams
exports.getTeams = async (req, res) => {
    try {
        const teams = await Team.find().populate('members', 'username');
        res.json(teams);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single team by ID
exports.getTeamById = async (req, res) => {
    const { id } = req.params;
    try {
        const team = await Team.findById(id).populate('members');
        if (!team) {
            return res.status(404).json({ message: 'Team not found' });
        }
        res.json(team);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update a team by ID
exports.updateTeam = async (req, res) => {
    const { id } = req.params;
    const { teamName, members } = req.body;
    try {
        const team = await Team.findByIdAndUpdate(id, { teamName, members }, { new: true });
        if (!team) {
            return res.status(404).json({ message: 'Team not found' });
        }
        res.json(team);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete a team by ID
exports.deleteTeam = async (req, res) => {
    const { id } = req.params;
    try {
        const team = await Team.findByIdAndDelete(id);
        if (!team) {
            return res.status(404).json({ message: 'Team not found' });
        }
        res.json({ message: 'Team deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
