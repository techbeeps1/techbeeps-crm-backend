const express = require('express');
const router = express.Router();
const {
    createTeam,
    getTeams,
    getTeamById,
    updateTeam,
    deleteTeam,
} = require('../../controllers/Resources/teamController');

router.post('/teams', createTeam);          // Create a new team
router.get('/teams', getTeams);              // Get all teams
router.get('/teams/:id', getTeamById);       // Get a single team by ID
router.put('/teams/:id', updateTeam);        // Update a team by ID
router.delete('/teams/:id', deleteTeam);     // Delete a team by ID

module.exports = router;
