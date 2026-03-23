const Set = require('../model/Set');

const createNewSet = async (req, res) => {
    if (!req?.body?.name || !req?.id || !req?.body?.description) {
        return res.status(400).json({ 'message': 'Missing data' });
    }

    try {
        const result = await Set.create({
            name: req.body.name,
            ownerId: req.id,
            description: req.body.description,
            requirements: []
        });
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ message: "Internal server error" });
    }
}

const getPersonalSets = async (req, res) => {
    if (!req?.id) {
        return res.status(400).json({ 'message': 'Missing data' });
    }

    try {
        // Optimization: Let MongoDB do the filtering
        const personalSets = await Set.find({ ownerId: req.id });
        res.status(200).json(personalSets);
    } catch (err) {
        res.status(500).json({ message: "Internal server error" });
    }
}

const updateSet = async (req, res) => {
    const { id } = req.params; // Get set ID from URL
    const isAdmin = req.roles?.includes(5150); // Assuming 5150 is Admin from your store

    if (!id) return res.status(400).json({ message: "Set ID required" });

    try {
        const foundSet = await Set.findById(id);
        if (!foundSet) return res.status(404).json({ message: "Set not found" });

        // Authorization Check: Must be owner OR Admin
        if (foundSet.ownerId !== req.id && !isAdmin) {
            return res.status(403).json({ message: "Unauthorized to update this set" });
        }

        // Update fields provided in body
        if (req.body.name) foundSet.name = req.body.name;
        if (req.body.requirements) foundSet.requirements = req.body.requirements;
        if (req.body.category) foundSet.category = req.body.category

        const updatedSet = await foundSet.save();
        res.status(200).json(updatedSet);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

const deleteSet = async (req, res) => {
    const { id } = req.body;
    const isAdmin = req.roles?.includes(5150); // Admin role

    if (!id) {
        return res.status(400).json({ message: "Set ID required" });
    }

    if (!req?.id) {
        return res.status(400).json({ message: "Missing user ID" });
    }

    try {
        const foundSet = await Set.findById(id);

        if (!foundSet) {
            return res.status(404).json({ message: "Set not found" });
        }

        // 🔐 Authorization check (same as update)
        if (foundSet.ownerId !== req.id && !isAdmin) {
            return res.status(403).json({ message: "Unauthorized to delete this set" });
        }

        await foundSet.deleteOne();

        res.status(200).json({ message: "Set deleted successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    createNewSet,
    getPersonalSets,
    updateSet,
    deleteSet
}