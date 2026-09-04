const Task = require('../models/taskModel');
const User = require('../models/user')
const nodemailer = require('nodemailer');
const EmailTemplate = require('../models/reporting');

// Create a new task
// Create a transporter for Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


exports.createTask = async (req, res) => {
    try {
        const taskData = { ...req.body };

        // Sanitize ObjectId fields: remove empty strings, 'null', 'undefined'
        if (!taskData.job || taskData.job === '' || taskData.job === 'undefined' || taskData.job === 'null') {
            delete taskData.job;
        }
        if (!taskData.customer || taskData.customer === '' || taskData.customer === 'undefined' || taskData.customer === 'null') {
            delete taskData.customer;
        }
        if (taskData.teams && Array.isArray(taskData.teams)) {
            taskData.teams = taskData.teams.filter(tid => tid && tid !== '');
        }
        if (taskData.directMembers && Array.isArray(taskData.directMembers)) {
            taskData.directMembers = taskData.directMembers.filter(mid => mid && mid !== '');
        }

        const task = new Task(taskData);
        await task.save();

        const teamMembers = taskData.teamMembers;
        if (teamMembers && Array.isArray(teamMembers) && teamMembers.length > 0) {
            try {
                const users = await User.find({ '_id': { $in: teamMembers } });
                const emailTemplate = await EmailTemplate.findById("677bc309a951e7a4ba54e249");
                if (emailTemplate && users && users.length > 0) {
                    let emailHtml = emailTemplate.htmlContent;
                    const teamMembersList = users.map(user => `<li>${user.username} (${user.email})</li>`).join('');
                    emailHtml = emailHtml.replace(/{{\s*task.teamMembers\s*}}/g, `<ul>${teamMembersList}</ul>`);

                    for (const user of users) {
                        let data = {
                            user: user,
                            task: task
                        };
                        let userEmailHtml = emailHtml;
                        userEmailHtml = userEmailHtml.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
                            return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
                        });
                        const mailOptions = {
                            from: process.env.SMTP_USER,
                            to: user.email,
                            subject: `New Task Assigned to ${user.username}`,
                            html: userEmailHtml
                        };
                        await transporter.sendMail(mailOptions);
                    }
                }
            } catch (emailErr) {
                console.error("Error sending task notification emails:", emailErr.message);
            }
        }

        res.status(201).json({ message: 'Task created successfully', task });
    } catch (error) {
        res.status(400).json({ message: 'Error creating task', error: error.message });
    }
};

// Get all tasks
exports.getTasks = async (req, res) => {
    try {
        const { scheduledFor,jobId } = req.query; // Get the scheduledFor parameter from query
        let filter = {}; // Default filter (no filter applied)
        if (jobId) {
            filter.job = jobId; // Filter for specific jobId
        }
        if (scheduledFor === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);  // Set to midnight
            const endOfDay = new Date(startOfDay);
            endOfDay.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: startOfDay.toISOString(), $lt: endOfDay.toISOString() }; // Filter for today
        }
        else if (scheduledFor === 'tomorrow') {
            const startOfTomorrow = new Date();
            startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);  // Move to tomorrow
            startOfTomorrow.setHours(0, 0, 0, 0);  // Set to midnight
            const endOfTomorrow = new Date(startOfTomorrow);
            endOfTomorrow.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: startOfTomorrow.toISOString(), $lt: endOfTomorrow.toISOString() }; // Filter for tomorrow
        }
        else if (scheduledFor === 'ever') {
            filter = {}; // No filter on scheduledFor, return all tasks
        }
        else if (scheduledFor) {
            const specificDate = new Date(scheduledFor);
            specificDate.setHours(0, 0, 0, 0);  // Set to midnight of the specific date
            const endOfSpecificDate = new Date(specificDate);
            endOfSpecificDate.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: specificDate.toISOString(), $lt: endOfSpecificDate.toISOString() }; // Filter by specific date
        }

        // Role-based filtering: Non-admins only see tasks assigned to them
        if (req.user && req.user.role !== 'Admin') {
            const Team = require('../models/Resources/team');
            let userTeamIds = [];
            try {
                const userTeams = await Team.find({ members: req.user.userId }, '_id');
                userTeamIds = userTeams.map(t => t._id);
            } catch (teamErr) {
                console.warn('Error fetching user teams for task filtering:', teamErr.message);
            }

            const assignmentConditions = [
                { directMembers: req.user.userId },
                { teamMembers: req.user.userId }
            ];

            if (req.user.username) {
                const escapedName = req.user.username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                assignmentConditions.push({
                    assignedTo: { $regex: new RegExp(escapedName, 'i') }
                });
            }

            if (userTeamIds.length > 0) {
                assignmentConditions.push({ teams: { $in: userTeamIds } });
            }

            filter.$and = filter.$and || [];
            filter.$and.push({ $or: assignmentConditions });
        }

        const tasks = await Task.find(filter)
            .populate({
                path: 'customer',
                populate: {
                    path: 'address',
                    match: { addressType: 'head' }, // Only populate address with type 'head'
                },
            })
            .populate('job', 'relocation index')
            .populate('teamMembers', 'username email')
            .populate('teams', 'teamName members')
            .populate('directMembers', 'username email')
            .sort({ createdAt: -1 });
        res.status(200).json(tasks);
    } catch (error) {
        res.status(400).json({ message: 'Error fetching tasks', error: error.message });
    }
};

// Update a task
exports.updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        if (!updateData.job || updateData.job === '' || updateData.job === 'undefined' || updateData.job === 'null') {
            updateData.job = null;
        }
        if (!updateData.customer || updateData.customer === '' || updateData.customer === 'undefined' || updateData.customer === 'null') {
            updateData.customer = null;
        }
        if (updateData.teams && Array.isArray(updateData.teams)) {
            updateData.teams = updateData.teams.filter(tid => tid && tid !== '');
        }
        if (updateData.directMembers && Array.isArray(updateData.directMembers)) {
            updateData.directMembers = updateData.directMembers.filter(mid => mid && mid !== '');
        }
        const updatedTask = await Task.findByIdAndUpdate(id, updateData, { new: true });
        if (!updatedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
    } catch (error) {
        res.status(400).json({ message: 'Error updating task', error: error.message });
    }
};

// Delete a task
exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTask = await Task.findByIdAndDelete(id);
        if (!deletedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting task', error: error.message });
    }
};
