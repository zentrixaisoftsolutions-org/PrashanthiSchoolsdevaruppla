import React, { useEffect, useState } from 'react';
import classNameService, { ClassName } from '../../services/classNameService';
import sectionService from '../../services/sectionService';
import classSectionService, { ClassSection } from '../../services/classSectionService';

const Classes: React.FC = () => {
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');

  // Add Class Form
  const [newClassName, setNewClassName] = useState('');
  const [newClassOrder, setNewClassOrder] = useState(0);

  // Add Section Form
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [newSectionName, setNewSectionName] = useState('');
  const [newCapacity, setNewCapacity] = useState(40);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [classNamesData, sectionsData] = await Promise.all([
        classNameService.listClassNames(),
        classSectionService.listClassSections()
      ]);
      setClassNames(classNamesData);
      setClassSections(sectionsData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    
    try {
      await classNameService.createClassName({
        name: newClassName.trim(),
        display_order: newClassOrder,
      });
      setNewClassName('');
      setNewClassOrder(classNames.length + 1);
      setSuccess('Class added successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add class');
    }
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId || !newSectionName.trim()) return;

    try {
      // First check if section exists, if not create it
      let sections = await sectionService.listSections();
      let section = sections.find(s => s.name.toLowerCase() === newSectionName.trim().toLowerCase());
      
      if (!section) {
        section = await sectionService.createSection({
          name: newSectionName.trim(),
          display_order: sections.length + 1,
        });
      }

      // Then create the class-section mapping
      await classSectionService.createClassSection({
        class_name_id: selectedClassId as number,
        section_id: section.id,
        capacity: newCapacity,
      });

      setNewSectionName('');
      setNewCapacity(40);
      setSelectedClassId('');
      setSuccess('Section added successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add section');
    }
  };

  const handleDeleteSection = async (mappingId: number) => {
    if (!window.confirm('Remove this section from the class?')) return;
    try {
      await classSectionService.deleteClassSection(mappingId);
      setSuccess('Section removed');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove section');
    }
  };

  const handleDeleteClass = async (id: number) => {
    if (!window.confirm('Delete this class? All assigned sections will be removed.')) return;
    try {
      await classNameService.deleteClassName(id);
      setSuccess('Class deleted');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete class');
    }
  };

  // Get unique values for filters
  const uniqueClasses = [...new Set(classSections.map(cs => cs.class_name))];
  const uniqueSections = [...new Set(classSections.map(cs => cs.section_name))];

  // Filter the class sections
  const filteredSections = classSections.filter(cs => {
    const matchClass = !filterClass || cs.class_name === filterClass;
    const matchSection = !filterSection || cs.section_name === filterSection;
    return matchClass && matchSection;
  });

  // Group by class for display
  const groupedByClass = classNames.map(cn => ({
    ...cn,
    sections: filteredSections.filter(cs => cs.class_name_id === cn.id)
  })).filter(cn => {
    if (!filterClass && !filterSection) return true;
    if (filterClass && cn.name !== filterClass) return false;
    if (filterSection && !cn.sections.some(s => s.section_name === filterSection)) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Class Management</h1>
        <p className="text-gray-600 mt-1">Manage classes and their sections with capacity</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Add Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Add Class */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Add New Class</h3>
          <form onSubmit={handleAddClass} className="flex gap-2">
            <input
              type="text"
              placeholder="Class name (e.g., 1 CLASS)"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
            <input
              type="number"
              placeholder="Order"
              value={newClassOrder}
              onChange={(e) => setNewClassOrder(parseInt(e.target.value) || 0)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </form>
        </div>

        {/* Add Section to Class */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Add Section to Class</h3>
          <form onSubmit={handleAddSection} className="flex gap-2">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value ? parseInt(e.target.value) : '')}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            >
              <option value="">Select Class</option>
              {classNames.map(cn => (
                <option key={cn.id} value={cn.id}>{cn.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Section (e.g., A)"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
            <input
              type="number"
              placeholder="Capacity"
              value={newCapacity}
              onChange={(e) => setNewCapacity(parseInt(e.target.value) || 40)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              min={1}
            />
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Filters</h3>
        <div className="flex gap-4 flex-wrap">
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          >
            <option value="">All Classes</option>
            {uniqueClasses.map(cn => (
              <option key={cn} value={cn}>{cn}</option>
            ))}
          </select>
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          >
            <option value="">All Sections</option>
            {uniqueSections.map(sn => (
              <option key={sn} value={sn}>{sn}</option>
            ))}
          </select>
          {(filterClass || filterSection) && (
            <button
              onClick={() => { setFilterClass(''); setFilterSection(''); }}
              className="text-gray-500 hover:text-gray-700 text-sm underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Class List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groupedByClass.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No classes found. Add a class to get started.
                </td>
              </tr>
            ) : (
              groupedByClass.map((cls) => (
                <React.Fragment key={cls.id}>
                  {cls.sections.length === 0 ? (
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-gray-900">{cls.name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-400 italic">No sections</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-400">-</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          Delete Class
                        </button>
                      </td>
                    </tr>
                  ) : (
                    cls.sections.map((section, idx) => (
                      <tr key={section.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {idx === 0 ? (
                            <span className="font-medium text-gray-900">{cls.name}</span>
                          ) : (
                            <span className="text-gray-300">↳</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-sm bg-indigo-100 text-indigo-800 rounded">
                            {section.section_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          {section.capacity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteSection(section.id)}
                            className="text-red-600 hover:text-red-900 text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-500">
        Total: {classNames.length} classes, {classSections.length} sections
      </div>
    </div>
  );
};

export default Classes;
