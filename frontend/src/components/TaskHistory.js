import React from "react";
import UploadProgressBar from "./UploadProgressBar";

const TaskHistory = ({ tasks }) => {
    // Filtrer les tâches qui ne sont pas terminées
    const activeTasks = tasks.filter(task => !task.completed);

    return (
        <div className="z-10 md:max-w-96 max-w-fit w-full fixed bottom-4 right-4 dark:text-neutral-100 p-6 bg-blue-50 dark:bg-slate-950 rounded-xl shadow-lg border border-slate-800">
            <h2 className="text-lg font-bold mb-4">Tâches en cours</h2>
            {activeTasks.map((task) => (
                <div key={task.id} className="mb-4">
                    <UploadProgressBar progress={task.progress} label={task.label} color="bg-gradient-to-l from-blue-500 to-cyan-500" />
                    {task.error && <p className="w-fit mx-auto px-4 py-2 bg-gradient-to-r from-red-950 to-green-900 dark:text-neutral-100 rounded-full shadow-xl">Erreur : {task.error}</p>}
                </div>
            ))}
        </div>
    );
};

export default TaskHistory;
