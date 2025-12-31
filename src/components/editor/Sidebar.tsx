"use client";

import React from 'react';
import { useEditorStore } from '@/lib/store';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Trash2, Plane, Car, Train, Footprints } from 'lucide-react';

export default function Sidebar() {
    const { waypoints, updateWaypoint, removeWaypoint, reorderWaypoints, projectTitle, setProjectTitle } = useEditorStore();

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(waypoints);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        reorderWaypoints(items);
    };

    return (
        <div className="w-80 h-full bg-white border-r flex flex-col shadow-xl z-20">
            <div className="p-5 border-b bg-white">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Project Title</label>
                <input
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    className="w-full text-xl font-bold mt-1 outline-none border-b border-transparent focus:border-blue-500 transition-colors"
                />
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="waypoints">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                                {waypoints.map((wp, index) => (
                                    <Draggable key={wp.id} draggableId={wp.id} index={index}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={`bg-white p-3 rounded-lg border transition-all ${snapshot.isDragging ? 'shadow-lg rotate-1 border-blue-400' : 'shadow-sm hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div {...provided.dragHandleProps} className="text-gray-300 cursor-grab"><GripVertical size={18} /></div>
                                                    <input
                                                        value={wp.name}
                                                        onChange={(e) => updateWaypoint(wp.id, { name: e.target.value })}
                                                        className="font-semibold text-gray-800 w-full outline-none bg-transparent"
                                                    />
                                                    <button onClick={() => removeWaypoint(wp.id)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 size={16} /></button>
                                                </div>
                                                <div className="flex gap-2 pl-7">
                                                    {(['plane', 'car', 'train', 'walk'] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            onClick={() => updateWaypoint(wp.id, { transport: mode })}
                                                            className={`p-1.5 rounded-lg transition-colors ${wp.transport === mode ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                                }`}
                                                        >
                                                            {mode === 'plane' && <Plane size={14} />}
                                                            {mode === 'car' && <Car size={14} />}
                                                            {mode === 'train' && <Train size={14} />}
                                                            {mode === 'walk' && <Footprints size={14} />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </div>
        </div>
    );
}
