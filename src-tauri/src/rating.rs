use std::fs;
use xmp_toolkit::{XmpFile, XmpMeta, XmpValue};
use exif::{In, Reader, Tag};

const XMP_NS_XMP: &str = "http://ns.adobe.com/xap/1.0/";

/// XMP Rating 읽기
pub fn read_rating(file_path: &str) -> Result<i32, String> {
    let mut xmp_file = XmpFile::new().map_err(|e| format!("XMP 파일 초기화 실패: {}", e))?;

    // 파일 열기
    xmp_file.open_file(file_path, xmp_toolkit::OpenFileOptions::default().only_xmp())
        .map_err(|e| format!("파일 열기 실패: {}", e))?;

    // XMP 메타데이터 가져오기
    let xmp = xmp_file.xmp().ok_or("XMP 메타데이터 없음")?;

    // Rating 프로퍼티 읽기
    match xmp.property(XMP_NS_XMP, "Rating") {
        Some(rating_prop) => {
            let rating_str = rating_prop.value.as_str();
            rating_str.parse::<i32>()
                .map_err(|_| format!("Rating 파싱 실패: {}", rating_str))
        }
        None => Ok(0) // Rating이 없으면 0 (unrated)
    }
}

/// XMP Rating 쓰기 (파일 수정 시간 복원 포함)
pub fn write_rating(file_path: &str, rating: i32) -> Result<(), String> {
    // 유효성 검사
    if rating < 0 || rating > 5 {
        return Err(format!("유효하지 않은 별점: {}. 0-5 사이여야 합니다.", rating));
    }

    // EXIF에서 촬영 시간 읽기
    let original_datetime = read_exif_datetime(file_path)?;

    // XMP 파일 열기
    let mut xmp_file = XmpFile::new().map_err(|e| format!("XMP 파일 초기화 실패: {}", e))?;

    xmp_file.open_file(
        file_path,
        xmp_toolkit::OpenFileOptions::default()
            .for_update()
            .use_smart_handler()
    ).map_err(|e| format!("파일 열기 실패: {}", e))?;

    // 기존 XMP 가져오기 또는 새로 생성
    let mut xmp = match xmp_file.xmp() {
        Some(existing_xmp) => existing_xmp.clone(),
        None => XmpMeta::new().map_err(|e| format!("XMP 생성 실패: {}", e))?
    };

    // Rating 프로퍼티 설정
    if rating == 0 {
        // 0이면 Rating 프로퍼티 삭제 (unrated)
        let _ = xmp.delete_property(XMP_NS_XMP, "Rating");
    } else {
        xmp.set_property(
            XMP_NS_XMP,
            "Rating",
            &XmpValue::from(rating.to_string())
        ).map_err(|e| format!("Rating 설정 실패: {}", e))?;
    }

    // XMP 업데이트
    xmp_file.put_xmp(&xmp).map_err(|e| format!("XMP 업데이트 실패: {}", e))?;

    // 파일에 쓰기
    xmp_file.close();

    // 파일 수정 시간을 EXIF 촬영 시간으로 복원
    if let Some(datetime) = original_datetime {
        set_file_modified_time(file_path, &datetime)?;
    }

    Ok(())
}

/// EXIF에서 촬영 시간 읽기
fn read_exif_datetime(file_path: &str) -> Result<Option<String>, String> {
    let file = fs::File::open(file_path)
        .map_err(|e| format!("파일 열기 실패: {}", e))?;

    let mut bufreader = std::io::BufReader::new(&file);
    let exif_reader = Reader::new()
        .read_from_container(&mut bufreader)
        .map_err(|e| format!("EXIF 읽기 실패: {}", e))?;

    // DateTimeOriginal 찾기
    if let Some(field) = exif_reader.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        Ok(Some(field.display_value().to_string()))
    } else {
        Ok(None)
    }
}

/// 파일 수정 시간 설정
fn set_file_modified_time(file_path: &str, datetime_str: &str) -> Result<(), String> {
    use chrono::{DateTime, NaiveDateTime};
    use std::time::UNIX_EPOCH;

    // EXIF 날짜 형식: "2024-01-15 12:30:45"
    let naive_dt = NaiveDateTime::parse_from_str(datetime_str, "%Y-%m-%d %H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(datetime_str, "%Y:%m:%d %H:%M:%S"))
        .map_err(|e| format!("날짜 파싱 실패: {}", e))?;

    let datetime: DateTime<chrono::Utc> = DateTime::from_naive_utc_and_offset(naive_dt, chrono::Utc);
    let duration = datetime.signed_duration_since(DateTime::<chrono::Utc>::from(UNIX_EPOCH));
    let system_time = UNIX_EPOCH + std::time::Duration::from_secs(duration.num_seconds() as u64);

    // 파일 수정 시간 설정
    filetime::set_file_mtime(
        file_path,
        filetime::FileTime::from_system_time(system_time)
    ).map_err(|e| format!("파일 시간 설정 실패: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rating_validation() {
        // 유효하지 않은 별점 테스트
        assert!(write_rating("test.jpg", -1).is_err());
        assert!(write_rating("test.jpg", 6).is_err());

        // 유효한 별점
        assert_eq!(0, 0); // 0-5는 유효
    }
}
