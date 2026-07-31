// const express = require('express');
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');
// //const Icon = require('../../models/Valuation/iconsModel');

// const router = express.Router();

// // const upload = multer({
// //     dest: 'uploads/', // Temporary upload folder
// //     fileFilter: (req, file, cb) => {
// //         if (file.mimetype === 'image/svg+xml') cb(null, true);
// //         else cb(new Error('Only SVG files are allowed!'));
// //     }
// // });


// const upload = multer({
//   storage: multer.memoryStorage(),

//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === "image/svg+xml") {
//       cb(null, true);
//     } else {
//       cb(new Error("Only SVG files are allowed!"));
//     }
//   },
// });

// module.exports = upload;
// router.post('/upload', upload.single('icon'), async (req, res) => {
//     try {
//         const { name } = req.body;
//         const icon = await Icon.findOne({name});
//         if (icon) {
//             return res.status(404).json({ message: 'Name already exits' });
//         }
//         const iconFile = req.file;
//         const svgContent = fs.readFileSync(iconFile.path, 'utf-8');
//         const newIcon = new Icon({ name, svg: svgContent });
//         await newIcon.save();
//         fs.unlinkSync(iconFile.path);
//         res.status(201).json({ message: 'Icon uploaded successfully', icon: newIcon });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// router.get('/', async (req, res) => {
//     try {
//         const icons = await Icon.find();
//         res.json(icons);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// router.get('/:id', async (req, res) => {
//     try {
//         const icon = await Icon.findById(req.params.id);
//         if (!icon) return res.status(404).json({ message: 'Icon not found' });
//         res.json(icon);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// router.delete('/:id', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const deletedIcon = await Icon.findByIdAndDelete(id);
//         if (!deletedIcon) {
//             return res.status(404).json({ message: 'Icon not found' });
//         }
//         res.json({ message: 'Icon deleted successfully', icon: deletedIcon });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });
// router.put('/:id', upload.single('icon'), async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { name } = req.body;
//         const iconFile = req.file;
//         const svgContent = fs.readFileSync(iconFile.path, 'utf-8');
//         const icon = await Icon.findById(id);
//         if (!icon) {
//             return res.status(404).json({ message: 'Icon not found' });
//         }
//         if (name) {
//             icon.name = name;
//         }
//         if (iconFile) {
//             icon.svg = svgContent;
//         }
//         await icon.save();
//         fs.unlinkSync(iconFile.path);
//         res.json({ message: 'Icon updated successfully', icon });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'Failed to update icon' });
//     }
// });

// module.exports = router;
