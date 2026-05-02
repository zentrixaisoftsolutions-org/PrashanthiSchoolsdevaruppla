"""
Performance optimization utilities using NumPy and Pandas.
Provides fast vectorized operations for attendance, fees, and marks calculations.
"""

import numpy as np
import pandas as pd
from datetime import date, timedelta
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session


def calculate_working_days_vectorized(start_date: date, end_date: date, exclude_sunday: bool = True) -> int:
    """
    Fast working days calculation using NumPy.
    
    Args:
        start_date: Start date
        end_date: End date
        exclude_sunday: If True, excludes Sundays (weekday=6); if False, only Saturdays count (Mon-Sat)
    
    Returns:
        Number of working days
    """
    if end_date < start_date:
        return 0
    
    # Create date range using pandas
    date_range = pd.date_range(start=start_date, end=end_date, freq='D')
    
    # Get weekdays: 0=Monday, 6=Sunday
    weekdays = date_range.weekday.values
    
    if exclude_sunday:
        # Exclude Sunday (weekday=6): Mon-Sat working days
        working_days = np.sum(weekdays < 6)
    else:
        # Exclude Sunday only, include Saturday
        working_days = np.sum(weekdays < 6)
    
    return int(working_days)


def aggregate_attendance_bulk(attendance_data: List[Dict], total_students: int) -> Dict:
    """
    Bulk aggregate attendance statistics using Pandas.
    
    Args:
        attendance_data: List of dicts with keys: student_id, status, attendance_date
        total_students: Total number of students for percentages
    
    Returns:
        Dictionary with aggregated stats: present, absent, late, percentage, etc.
    """
    if not attendance_data:
        return {
            'present': 0,
            'absent': 0,
            'late': 0,
            'total_marked': 0,
            'percentage': 0.0
        }
    
    # Convert to DataFrame for fast operations
    df = pd.DataFrame(attendance_data)
    
    # Count by status
    status_counts = df['status'].value_counts().to_dict()
    
    present = status_counts.get('present', 0) + status_counts.get('late', 0)
    absent = status_counts.get('absent', 0)
    late = status_counts.get('late', 0)
    total_marked = len(df['student_id'].unique())
    
    percentage = (present / total_students * 100) if total_students > 0 else 0
    
    return {
        'present': int(present),
        'absent': int(absent),
        'late': int(late),
        'total_marked': int(total_marked),
        'not_marked': max(0, total_students - total_marked),
        'percentage': round(percentage, 1)
    }


def calculate_attendance_summary_per_student(
    attendance_logs: pd.DataFrame,
    student_ids: List[int],
    working_days: int
) -> pd.DataFrame:
    """
    Calculate attendance summary for multiple students using vectorized operations.
    
    Args:
        attendance_logs: DataFrame with columns [student_id, status]
        student_ids: List of student IDs to process
        working_days: Total working days in period
    
    Returns:
        DataFrame with columns: student_id, present_days, absent_days, late_days, percentage
    """
    if attendance_logs.empty:
        # Return zeros for all students
        return pd.DataFrame({
            'student_id': student_ids,
            'present_days': 0,
            'absent_days': working_days,
            'late_days': 0,
            'percentage': 0.0
        })
    
    # Count statuses per student
    summary = attendance_logs.groupby(['student_id', 'status']).size().unstack(fill_value=0)
    
    # Ensure all status columns exist
    for col in ['present', 'absent', 'late']:
        if col not in summary.columns:
            summary[col] = 0
    
    # Calculate metrics
    summary['present_days'] = summary['present'] + summary['late']
    summary['late_days'] = summary['late']
    summary['total_logged'] = summary[['present', 'absent', 'late']].sum(axis=1)
    summary['absent_days'] = summary['absent'] + (working_days - summary['total_logged'])
    summary['percentage'] = (summary['present_days'] / working_days * 100) if working_days > 0 else 0
    
    # Round percentage
    summary['percentage'] = summary['percentage'].round(2)
    
    # Reset index and select columns
    result = summary.reset_index()[['student_id', 'present_days', 'absent_days', 'late_days', 'percentage']]
    
    # Add missing students with zeros
    all_students_df = pd.DataFrame({'student_id': student_ids})
    result = all_students_df.merge(result, on='student_id', how='left').fillna({
        'present_days': 0,
        'absent_days': working_days,
        'late_days': 0,
        'percentage': 0.0
    })
    
    return result


def calculate_fee_aggregations(
    fee_structures: List[Dict],
    payments: List[Dict],
    student_class_mapping: Dict[int, int]
) -> Dict:
    """
    Calculate fee aggregations using Pandas for better performance.
    
    Args:
        fee_structures: List of dicts with keys: class_name_id, amount, fee_type
        payments: List of dicts with keys: student_id, amount_paid, fee_structure_id, status
        student_class_mapping: Dict mapping student_id -> class_name_id
    
    Returns:
        Dictionary with aggregated fee statistics
    """
    if not fee_structures:
        return {
            'total_fee': 0.0,
            'total_paid': 0.0,
            'total_due': 0.0,
            'by_class': {}
        }
    
    # Convert to DataFrames
    fs_df = pd.DataFrame(fee_structures)
    
    # Calculate total expected fees
    if not student_class_mapping:
        total_fee = 0.0
    else:
        # Count students per class
        class_counts = pd.Series(student_class_mapping).value_counts().to_dict()
        
        # Calculate total fees
        fs_df['student_count'] = fs_df['class_name_id'].map(class_counts).fillna(0)
        fs_df['total_amount'] = fs_df['amount'] * fs_df['student_count']
        total_fee = fs_df['total_amount'].sum()
    
    # Calculate total paid
    if payments:
        payments_df = pd.DataFrame(payments)
        total_paid = payments_df[payments_df['status'] == 'completed']['amount_paid'].sum()
    else:
        total_paid = 0.0
    
    total_due = max(0, total_fee - total_paid)
    
    return {
        'total_fee': float(total_fee),
        'total_paid': float(total_paid),
        'total_due': float(total_due)
    }


def calculate_marks_statistics(marks_data: List[Dict]) -> Dict:
    """
    Calculate subject-wise statistics (topper, average, pass rate) using NumPy/Pandas.
    
    Args:
        marks_data: List of dicts with keys: subject_id, marks_obtained, max_marks, is_absent
    
    Returns:
        Dictionary with subject_id as key and stats as value
    """
    if not marks_data:
        return {}
    
    df = pd.DataFrame(marks_data)
    
    # Filter out absent students
    df_valid = df[~df['is_absent'] & df['marks_obtained'].notna()].copy()
    
    if df_valid.empty:
        return {}
    
    # Calculate percentage
    df_valid['percentage'] = (df_valid['marks_obtained'] / df_valid['max_marks']) * 100
    
    # Group by subject
    stats = df_valid.groupby('subject_id').agg({
        'marks_obtained': ['max', 'mean', 'min', 'std'],
        'percentage': ['mean', 'min', 'max'],
        'subject_id': 'count'
    }).round(2)
    
    # Flatten columns
    stats.columns = ['_'.join(col).strip() for col in stats.columns.values]
    stats = stats.rename(columns={
        'marks_obtained_max': 'topper_marks',
        'marks_obtained_mean': 'average_marks',
        'marks_obtained_min': 'lowest_marks',
        'marks_obtained_std': 'std_dev',
        'percentage_mean': 'average_percentage',
        'percentage_min': 'min_percentage',
        'percentage_max': 'max_percentage',
        'subject_id_count': 'student_count'
    })
    
    return stats.to_dict('index')


def calculate_grade_distribution(marks_data: List[Dict], grade_criteria: List[Dict]) -> Dict:
    """
    Calculate grade distribution across all students using vectorized operations.
    
    Args:
        marks_data: List of dicts with keys: student_id, percentage
        grade_criteria: List of dicts with keys: grade, min_percentage, max_percentage
    
    Returns:
        Dictionary with grade counts and percentages
    """
    if not marks_data or not grade_criteria:
        return {}
    
    df = pd.DataFrame(marks_data)
    
    # Create bins for grades
    grade_df = pd.DataFrame(grade_criteria).sort_values('min_percentage')
    bins = [-np.inf] + grade_df['min_percentage'].tolist() + [np.inf]
    labels = ['Below'] + grade_df['grade'].tolist()
    
    # Cut percentages into grade bins
    df['grade'] = pd.cut(df['percentage'], bins=bins, labels=labels, right=False)
    
    # Count grades
    grade_counts = df['grade'].value_counts().to_dict()
    total = len(df)
    
    # Calculate percentages
    grade_distribution = {
        grade: {
            'count': int(count),
            'percentage': round(count / total * 100, 1) if total > 0 else 0
        }
        for grade, count in grade_counts.items()
    }
    
    return grade_distribution


def calculate_percentile_ranks(scores: List[float]) -> np.ndarray:
    """
    Calculate percentile ranks for a list of scores using NumPy.
    
    Args:
        scores: List of scores
    
    Returns:
        Array of percentile ranks (0-100)
    """
    if not scores:
        return np.array([])
    
    scores_array = np.array(scores)
    
    # Calculate percentile rank for each score
    # Percentile = (number of values below score) / (total values) * 100
    percentiles = np.array([
        (np.sum(scores_array < score) / len(scores_array)) * 100
        for score in scores_array
    ])
    
    return np.round(percentiles, 1)


def calculate_batch_averages(data: pd.DataFrame, group_by: str, value_col: str) -> Dict:
    """
    Calculate averages grouped by a column using Pandas.
    
    Args:
        data: DataFrame with data
        group_by: Column name to group by
        value_col: Column name to calculate average
    
    Returns:
        Dictionary mapping group -> average
    """
    if data.empty:
        return {}
    
    averages = data.groupby(group_by)[value_col].mean().round(2).to_dict()
    return averages


def optimize_date_range_query(start_date: date, end_date: date, freq: str = 'D') -> List[date]:
    """
    Generate optimized date range for queries.
    
    Args:
        start_date: Start date
        end_date: End date
        freq: Frequency ('D' for daily, 'W' for weekly, 'M' for monthly)
    
    Returns:
        List of dates in range
    """
    date_range = pd.date_range(start=start_date, end=end_date, freq=freq)
    return [d.date() for d in date_range]


def bulk_percentage_calculation(obtained: np.ndarray, maximum: np.ndarray) -> np.ndarray:
    """
    Calculate percentages for arrays of obtained/maximum marks using NumPy.
    
    Args:
        obtained: Array of obtained marks
        maximum: Array of maximum marks
    
    Returns:
        Array of percentages (0-100)
    """
    with np.errstate(divide='ignore', invalid='ignore'):
        percentages = np.where(maximum > 0, (obtained / maximum) * 100, 0)
    
    return np.round(percentages, 2)
