"""
Performance optimization utilities package.
"""

from .performance import (
    calculate_working_days_vectorized,
    aggregate_attendance_bulk,
    calculate_attendance_summary_per_student,
    calculate_fee_aggregations,
    calculate_marks_statistics,
    calculate_grade_distribution,
    calculate_percentile_ranks,
    calculate_batch_averages,
    optimize_date_range_query,
    bulk_percentage_calculation
)

__all__ = [
    'calculate_working_days_vectorized',
    'aggregate_attendance_bulk',
    'calculate_attendance_summary_per_student',
    'calculate_fee_aggregations',
    'calculate_marks_statistics',
    'calculate_grade_distribution',
    'calculate_percentile_ranks',
    'calculate_batch_averages',
    'optimize_date_range_query',
    'bulk_percentage_calculation'
]
