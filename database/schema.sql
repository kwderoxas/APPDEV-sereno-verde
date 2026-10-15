CREATE TABLE IF NOT EXISTS admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    fb_name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(40) NOT NULL,
    region VARCHAR(120) NOT NULL,
    province VARCHAR(120) NOT NULL,
    city VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    guest_id BIGINT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    accommodation VARCHAR(80) NOT NULL,
    booking_type VARCHAR(24) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    guest_count SMALLINT UNSIGNED NOT NULL,
    special_requests TEXT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'rejected', 'blocked') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookings_date_accommodation (booking_date, accommodation, status),
    INDEX idx_bookings_guest (guest_id),
    CONSTRAINT fk_bookings_guest FOREIGN KEY (guest_id) REFERENCES guests(id)
);

CREATE TABLE IF NOT EXISTS feedback (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    guest_id BIGINT UNSIGNED NULL,
    guest_name VARCHAR(120) NOT NULL,
    villa ENUM('tuscan', 'spanish') NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_feedback_villa_created (villa, created_at),
    CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT fk_feedback_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id VARCHAR(128) NOT NULL PRIMARY KEY,
    expires BIGINT UNSIGNED NOT NULL,
    data MEDIUMTEXT NOT NULL,
    INDEX idx_admin_sessions_expires (expires)
);
